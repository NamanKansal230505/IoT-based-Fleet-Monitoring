# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.0.0] - 2026-05-06

### Added
- ESP32 firmware (`firmware/AgriTracker`) reading TS100 GPS @ 38400 baud and MPU6050 over I2C.
- Vibration-based engine on/off detection using accel-magnitude std-dev.
- Node.js + Express server with SQLite (built-in `node:sqlite`) and WebSocket live push.
- Government-style web dashboard with Leaflet map, Chart.js stats, district drill-down, geofence editor, alert log.
- 14 seeded districts across UP / Punjab / Haryana / Rajasthan / MP / Maharashtra / Bihar with simulated tractor fleet.
- Real ESP32 device pinned to Ghaziabad district; rest of fleet simulated for demo.
- Geofence breach detection (inclusion + exclusion zones) with point-in-polygon.
- Offline detection, online/offline alerts, engine state-change alerts.
- 0.5 s POST cadence for near-realtime feel.
