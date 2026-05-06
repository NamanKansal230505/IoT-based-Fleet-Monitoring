<div align="center">

# IoT based Fleet Monitoring
### *Krishi Yantra Track* — a government-portal style dashboard for monitoring subsidy-funded agricultural vehicles

[![CI](https://github.com/NamanKansal230505/IoT-based-Fleet-Monitoring/actions/workflows/ci.yml/badge.svg)](https://github.com/NamanKansal230505/IoT-based-Fleet-Monitoring/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![ESP32](https://img.shields.io/badge/ESP32-Arduino%203.x-E7352C?logo=espressif&logoColor=white)](https://github.com/espressif/arduino-esp32)
[![Made with Leaflet](https://img.shields.io/badge/Map-Leaflet-199900?logo=leaflet&logoColor=white)](https://leafletjs.com/)

End-to-end IoT system: an **ESP32** with **TS100 GPS** and **MPU6050** streams live telemetry to a **Node.js** server, persisted in **SQLite** and pushed via **WebSocket** to a **Leaflet + Chart.js** dashboard styled like an Indian government portal.

</div>

---

## Table of contents

- [Why this project](#why-this-project)
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Hardware](#hardware)
- [API & WebSocket](#api--websocket)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Why this project

State and central agricultural subsidy schemes disburse tractors and harvesters to beneficiaries. Once delivered, **utilisation oversight is essentially manual** — paper logs, periodic site visits, or no tracking at all. This project is a pilot platform that closes that loop with a low-cost on-board telematics unit (~₹2 000 in parts) and a self-hosted dashboard that any district office can run on a single laptop.

Real-world questions it answers:

- *Is the subsidised vehicle actually being used, or sitting idle?*
- *Is it being driven outside the registered farm / district (geofence breach)?*
- *How many engine hours and kilometres did it accumulate this month?*

---

## Features

### Field telemetry (ESP32)
- TS100 GPS over UART2 @ 38400 baud (TinyGPSPlus)
- MPU6050 accelerometer over I2C — engine on/off detected from **vibration σ**
- Wi-Fi POST every 0.5 s with shared-secret auth
- Graceful operation when sensors are missing (silent I2C, no boot loop)

### Server
- **Node.js + Express** REST API + **WebSocket** live push
- **`node:sqlite`** built-in SQLite — no native compile, runs on any Windows/Linux/macOS with Node ≥ 22
- Geofence engine (point-in-polygon) with **inclusion** and **exclusion** zones
- Auto-seeded fleet of 35 simulated tractors across 14 districts for demo, with the real ESP32 pinned to **Ghaziabad**
- Alert engine for: `engine_on`, `engine_off`, `online`, `offline`, `geofence_breach`
- Distance via haversine, engine-runtime accumulation, offline-after-N-seconds detector

### Dashboard
- Government-portal aesthetic: navy + gold palette, Source Serif headings, official chrome
- Hero KPI strip — total / online / engine-running / in-breach
- Searchable district grid; click → map zooms, vehicles filter
- Live Leaflet map with breadcrumb trail, legend, and draw tools (polygon/rectangle) for new geofences
- Vehicle detail card with live speed chart, runtime stats, GPS quality, vibration σ, source (Live vs Simulated)
- Alerts panel with click-to-acknowledge

---

## Architecture

```
┌──────────────────────────┐         ┌──────────────────────────────┐
│        ESP32 unit        │  HTTPS  │        Node.js server        │
│   GPS · MPU6050 · WiFi   │─POST───▶│  Express · WebSocket · auth  │
└──────────────────────────┘  /api/  └──────────────┬───────────────┘
                              telemetry             │
                                                    ▼
┌──────────────────────────┐ tick   ┌──────────────────────────────┐
│  Simulated dummy fleet   │──5s───▶│   node:sqlite  (data.db)     │
│   (server/sim.js)        │        │   telemetry · alerts · etc.  │
└──────────────────────────┘        └──────────────┬───────────────┘
                                                    │
                                                    ▼
                                    ┌──────────────────────────────┐
                                    │  Browser dashboard           │
                                    │  Leaflet · Chart.js · WS     │
                                    └──────────────────────────────┘
```

Detailed write-up: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Tech stack

| Layer       | Choice                                  | Why                                                  |
|-------------|-----------------------------------------|------------------------------------------------------|
| Firmware    | C++ / Arduino-ESP32                     | Mature, ubiquitous tooling; OTA-ready upgrade path   |
| GPS parsing | TinyGPSPlus                             | Battle-tested, low memory                            |
| IMU         | Raw I2C (no driver lib)                 | Avoid adding a heavyweight library for ~30 lines    |
| Server      | Node.js 22+ / Express 4                 | Tiny dep tree; built-in SQLite removes native compile |
| DB          | `node:sqlite`                           | File-based, zero ops, WAL mode                       |
| Realtime    | `ws`                                    | Simplest WebSocket lib; small surface                |
| Dashboard   | Vanilla JS + Leaflet + Chart.js         | No build step, no framework lock-in, fast to audit   |

---

## Quick start

> Requires **Node.js 22+** (Node 24 tested) and the **Arduino IDE** or **arduino-cli**.

### 1. Backend

```bash
git clone https://github.com/NamanKansal230505/IoT-based-Fleet-Monitoring.git
cd IoT-based-Fleet-Monitoring/server
cp config.example.json config.json
npm install
npm start
```
Open `http://localhost:3000`. The dashboard boots with 35 simulated tractors so you can interact immediately.

### 2. Firmware

```bash
cd ../firmware/AgriTracker
cp config.example.h config.h
# edit config.h:  WIFI_SSID, WIFI_PASSWORD, SERVER_HOST = your laptop's LAN IP
arduino-cli core install esp32:esp32 \
    --additional-urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
arduino-cli lib install "TinyGPSPlus"
arduino-cli compile --fqbn esp32:esp32:esp32 .
arduino-cli upload  --fqbn esp32:esp32:esp32 -p COM3 .   # set your port
```

The dashboard will mark `tractor-001` as **LIVE** in the Ghaziabad district once the ESP32 starts POSTing.

---

## Configuration

| File                                         | What                              | Committed? |
|----------------------------------------------|-----------------------------------|------------|
| `firmware/AgriTracker/config.example.h`      | Template — Wi-Fi, server, pins    | ✅ |
| `firmware/AgriTracker/config.h`              | Your real Wi-Fi creds + server IP | ❌ gitignored |
| `server/config.example.json`                 | Template — port, token            | ✅ |
| `server/config.json`                         | Your shared device token          | ❌ gitignored |

Key knobs in firmware `config.h`:

```cpp
#define POST_INTERVAL_MS      500     // telemetry cadence
#define ENGINE_ON_THRESHOLD   0.35f   // m/s² σ over the sample window
#define ENGINE_SAMPLE_WINDOW  20      // ~0.4 s @ 50 Hz
```

Key knobs in `server/config.json`:

```json
{ "port": 3000, "deviceToken": "...", "offlineAfterSec": 30, "minMoveMeters": 5 }
```

---

## Project structure

```
.
├── firmware/
│   └── AgriTracker/              ESP32 sketch (combined GPS + IMU + WiFi)
│       ├── AgriTracker.ino
│       └── config.example.h
├── TS100_GPS/                    Standalone GPS-only sketch (debug helper)
│   └── TS100_GPS.ino
├── server/
│   ├── server.js                 Express + WS entrypoint
│   ├── db.js                     SQLite schema (node:sqlite)
│   ├── seed.js                   District + dummy fleet seeding
│   ├── sim.js                    Dummy-device walker / engine toggler
│   ├── geo.js                    Point-in-polygon + haversine
│   ├── package.json
│   ├── config.example.json
│   └── public/
│       ├── index.html            Government-portal layout
│       ├── styles.css            Navy + gold theme
│       └── app.js                Map, charts, WebSocket, geofence editor
├── docs/
│   ├── ARCHITECTURE.md           Data flow, engine heuristic, deployment notes
│   ├── API.md                    REST + WebSocket reference
│   └── HARDWARE.md               BOM, wiring, mounting, alternatives
├── .github/
│   ├── workflows/ci.yml          Server smoke test + firmware compile
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── .editorconfig
├── .gitignore
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

---

## Hardware

| Component            | Connection                             |
|----------------------|----------------------------------------|
| TS100 GPS VCC / GND  | 5V / GND                               |
| TS100 GPS TX / RX    | ESP32 GPIO16 (RX2) / GPIO17 (TX2)      |
| MPU6050 VCC / GND    | **3.3V** / GND                         |
| MPU6050 SDA / SCL    | ESP32 GPIO21 / GPIO22                  |
| MPU6050 AD0          | GND or floating (I2C addr `0x68`)      |

Full wiring diagram, mounting recommendations, and alternative-parts notes: [`docs/HARDWARE.md`](docs/HARDWARE.md).

---

## API & WebSocket

| Method | Path                          | Purpose                              |
|--------|-------------------------------|--------------------------------------|
| POST   | `/api/telemetry`              | Field device pushes a sample         |
| GET    | `/api/districts`              | Districts with device counts         |
| GET    | `/api/devices`                | Live state of every device           |
| GET    | `/api/summary`                | Fleet-wide KPIs                      |
| GET    | `/api/history?deviceId=…`     | Historical track for one device      |
| GET    | `/api/alerts`                 | Latest alerts                        |
| POST   | `/api/alerts/:id/ack`         | Acknowledge an alert                 |
| GET    | `/api/geofences`              | List geofences                       |
| POST   | `/api/geofences`              | Create a geofence                    |
| PATCH  | `/api/geofences/:id`          | Enable / disable                     |
| DELETE | `/api/geofences/:id`          | Remove a geofence                    |

WebSocket on `/ws` streams `snapshot`, `telemetry`, `alert`, `alert_ack`, `geofences_changed` events.

Full payload schemas in [`docs/API.md`](docs/API.md).

---

## Roadmap

- [ ] OTA firmware updates (so deployed units don't need cable visits)
- [ ] HTTPS termination + per-device tokens issued at provisioning
- [ ] Utilisation reports (PDF export per beneficiary, per month)
- [ ] Multi-tenant deployment (state → district → block hierarchy)
- [ ] Offline buffering on the ESP32 (SD card) for poor-coverage areas
- [ ] PostgreSQL migration path with monthly partitions on `telemetry`
- [ ] Mobile-friendly responsive dashboard breakpoints
- [ ] Beneficiary self-service portal (read-only view of their own vehicle)

---

## Contributing

Bug reports and PRs are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Please don't include real Wi-Fi credentials or device tokens in commits; the gitignore list already covers `config.h` / `config.json`.

---

## License

[MIT](LICENSE) © 2026 Naman Kansal
