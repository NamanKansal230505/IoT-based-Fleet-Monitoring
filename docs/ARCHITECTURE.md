# Architecture

## High-level

```
┌──────────────────────────────────┐         ┌─────────────────────────────────┐
│         Field Telemetry          │         │         Backend Server          │
│                                  │         │                                 │
│   ┌─────────────────────────┐    │  HTTPS  │  ┌──────────────────────────┐   │
│   │ ESP32  (AgriTracker.ino)│────┼─POST───▶│  │ Express  /api/telemetry  │   │
│   │  • TinyGPSPlus  (UART2) │    │  every  │  │ Token auth · Geofence    │   │
│   │  • MPU6050     (I2C)    │    │  0.5s   │  │ engine on/off · alerts   │   │
│   │  • Engine = σ(accel)    │    │         │  └──────────────────────────┘   │
│   └─────────────────────────┘    │         │              │                  │
│                                  │         │              ▼                  │
└──────────────────────────────────┘         │  ┌──────────────────────────┐   │
                                             │  │  node:sqlite (data.db)   │   │
┌──────────────────────────────────┐         │  │  telemetry · alerts ·    │   │
│         Simulated Fleet          │         │  │  geofences · districts   │   │
│  35 dummy tractors across 14     │ tick 5s │  └──────────────────────────┘   │
│  districts. server/sim.js walks  │────────▶│              │                  │
│  each marker near district mean. │         │              ▼                  │
└──────────────────────────────────┘         │  ┌──────────────────────────┐   │
                                             │  │  WebSocket  /ws          │   │
                                             │  │  snapshot + live push    │   │
                                             │  └──────────────────────────┘   │
                                             └─────────────────────────────────┘
                                                            │
                                                            ▼
                                             ┌─────────────────────────────────┐
                                             │  Browser dashboard              │
                                             │   Leaflet (map+geofence draw)   │
                                             │   Chart.js (speed history)      │
                                             │   Vanilla JS  ·  no framework   │
                                             └─────────────────────────────────┘
```

## Data flow per telemetry sample

1. ESP32 reads GPS (NMEA over UART2) and MPU6050 (accel over I2C).
2. Every 20 ms an accel sample is appended to a 20-slot ring buffer; std-dev of magnitude is computed.
3. Every `POST_INTERVAL_MS` (default 500 ms) a JSON payload is built and POSTed to `/api/telemetry` with the shared device token.
4. Server validates the token, persists the row in `telemetry`, updates the in-memory device state, runs:
   - Distance accumulation (haversine, ignored under `minMoveMeters`).
   - Engine runtime accumulation (between consecutive ON samples).
   - Geofence point-in-polygon check vs. all active fences.
   - State-change alerts (`engine_on`, `engine_off`, `online`, `offline`, `geofence_breach`).
5. WebSocket fans out the new state to every connected dashboard.

## Engine on/off heuristic

We use the standard deviation of accelerometer magnitude over a sliding window:

```
mag      = sqrt(ax² + ay² + az²)
σ(mag)   over last N samples
engineOn = σ > ENGINE_ON_THRESHOLD   (default 0.35 m/s²)
```

Why σ and not raw acceleration: gravity dominates raw mag (~9.8 m/s²), so absolute magnitude is useless. σ removes the DC component, leaving vibration energy.

Tuning:
- `ENGINE_ON_THRESHOLD` ↑ to reject road bumps, ↓ for quieter engines.
- `ENGINE_SAMPLE_WINDOW` ↑ smooths but adds latency, ↓ reacts faster but flickers.

## Geofence model

Each fence is a polygon (`[[lat, lng], ...]`) with a `type`:

| Type        | Alert fires when                |
|-------------|---------------------------------|
| inclusion   | vehicle **leaves** the polygon  |
| exclusion   | vehicle **enters** the polygon  |

The check is naïve ray-casting; fine up to a few hundred fences. For city-scale deployments swap to an R-tree (e.g. `geokdbush`) and pre-load actively-monitored fences.

## Persistence

SQLite via Node's built-in `node:sqlite` (Node 22+). No native compile step. Tables:

- `districts` — seeded administrative regions.
- `devices` — registered tractors, including a `is_dummy` flag.
- `telemetry` — every real sample (sim samples are not persisted, to keep the DB small).
- `geofences` — polygons with active flag and optional district association.
- `alerts` — emitted state changes, acknowledgable.

WAL mode is enabled for concurrent readers.

## Deployment notes

The reference deployment is a laptop on the same Wi-Fi as the ESP32 — that is sufficient for pilots. For a real rollout:

- Move the server behind Nginx with TLS; the ESP32 firmware should switch to `WiFiClientSecure`.
- Replace shared-secret auth with a per-device token issued at provisioning.
- Migrate `data.db` to PostgreSQL for multi-tenant deployments and partition `telemetry` by month.
- Front the API with a queue (e.g. NATS / Redis stream) if device count > ~1 k to absorb POST bursts.
