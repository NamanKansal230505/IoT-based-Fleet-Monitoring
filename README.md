# IoT based Fleet Monitoring — Krishi Yantra Track

> A government-portal style dashboard for monitoring subsidy-funded agricultural vehicles using ESP32 + GPS + IMU telemetry.

End-to-end IoT system to track a government-subsidy tractor (or any vehicle).

**Hardware**: ESP32 + TS100 GPS + MPU6050
**Server**: Node.js + Express + SQLite + WebSocket
**Dashboard**: Leaflet map, geofence draw/edit, live alerts, Chart.js stats

```
ESP32 (WiFi) ──HTTP POST /api/telemetry──▶ Node server ──WebSocket──▶ Dashboard
                                              │
                                              └─ SQLite (telemetry, alerts, geofences)
```

---

## 1. Wiring

| Device       | Pin       | ESP32        |
|--------------|-----------|--------------|
| TS100 VCC    | VCC       | 5V (VIN)     |
| TS100 GND    | GND       | GND          |
| TS100 TX     | TX        | GPIO16 (RX2) |
| TS100 RX     | RX        | GPIO17 (TX2) |
| MPU6050 VCC  | VCC       | 3.3V         |
| MPU6050 GND  | GND       | GND          |
| MPU6050 SDA  | SDA       | GPIO21       |
| MPU6050 SCL  | SCL       | GPIO22       |

Keep the MPU6050 mounted firmly to the chassis — it detects engine vibration.

---

## 2. Server setup (run on your laptop / mini PC)

Requires **Node.js 18+**. From `server/`:

```powershell
npm install
npm start
```

Before first run, copy `server/config.example.json` to `server/config.json` and adjust if needed.

Server listens on `http://localhost:3000`. Open it in a browser — that's the dashboard.

Find your laptop's LAN IP (Windows `ipconfig` → IPv4 Address) — the ESP32 will POST to that IP.

---

## 3. Firmware setup

1. **Arduino IDE → Boards Manager**: install **esp32 by Espressif Systems**.
2. **Library Manager**: install **TinyGPSPlus** (Mikal Hart). The MPU6050 is read directly via `Wire.h`, no extra lib needed.
3. Open `firmware/AgriTracker/AgriTracker.ino`.
4. Copy `firmware/AgriTracker/config.example.h` to `firmware/AgriTracker/config.h` and fill in:
   - `WIFI_SSID`, `WIFI_PASSWORD`
   - `SERVER_HOST` = your laptop's LAN IP
   - `DEVICE_ID` (e.g. `tractor-001`)
   - `DEVICE_TOKEN` must match `deviceToken` in `server/config.json`
5. Select your ESP32 board + COM port → **Upload**.
6. Open Serial Monitor at **115200**. You should see WiFi connect, GPS fix, and `[POST] 200 ...` lines.

---

## 4. Using the dashboard

- **Live map** — tractor marker + 500-point breadcrumb trail. Marker turns green when engine is on.
- **Live status** — engine, speed, sats, HDOP, vibration σ, last-seen.
- **Today** — distance accumulated, engine runtime, active fences containing the vehicle.
- **Speed chart** — last 30 samples.
- **Geofences** — draw a polygon (or rectangle) with the toolbox on the left of the map, name it, choose:
  - **Inclusion** zone (allowed area — alert when leaves)
  - **Exclusion** zone (restricted area — alert when enters)
  Click Save. Disable/delete from the list.
- **Alerts** — `engine_on`, `engine_off`, `geofence_breach`, `online`, `offline`. Click to acknowledge.

---

## 5. Tuning engine detection

If the tractor reads ON when idle / OFF when running, change `ENGINE_ON_THRESHOLD` in `firmware/AgriTracker/config.h`. Watch the `vib` value on the dashboard — that's the accel magnitude std-dev (m/s²). Typical: ~0.05 stationary, ~0.5+ engine running.

---

## 6. Project layout

```
Agriculture Vehicle Monitoring/
├── firmware/AgriTracker/      ESP32 sketch (full system)
│   ├── AgriTracker.ino
│   └── config.h
├── TS100_GPS/                 Standalone GPS-only sketch (debug helper)
├── server/
│   ├── server.js              REST + WebSocket
│   ├── db.js                  SQLite schema
│   ├── geo.js                 Point-in-polygon, haversine
│   ├── config.json            Port, token, thresholds
│   ├── package.json
│   └── public/                Static dashboard (HTML/CSS/JS)
└── README.md
```
