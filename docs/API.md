# API Reference

Base URL: `http://<server-host>:3000`
All bodies are JSON. Auth is a shared `token` field on telemetry POSTs (matches `deviceToken` in `server/config.json`).

## Telemetry

### `POST /api/telemetry`
Ingest a single telemetry sample from a field device.

**Body**
```json
{
  "deviceId": "tractor-001",
  "token":    "change-me-shared-secret",
  "lat":      28.6692,
  "lng":      77.4538,
  "speed":    14.3,
  "alt":      215.4,
  "hdop":     1.1,
  "sats":     9,
  "fix":      true,
  "engineOn": true,
  "vib":      0.62,
  "utc":      "2026-05-06T10:30:01Z"
}
```
- All fields except `deviceId` and `token` are optional. Missing GPS fields are accepted (e.g. `fix: false` without `lat`/`lng`).

**Responses**
- `200 { "ok": true }`
- `401 { "error": "invalid token" }`

## Read APIs

### `GET /api/districts`
Returns every district with a device count.

### `GET /api/devices?districtId=<id>`
Returns current state for every (or one district's) device. State shape:

```json
{
  "deviceId": "tractor-001",
  "name": "Tractor tractor-001",
  "districtId": 1, "district": "Ghaziabad", "state": "Uttar Pradesh",
  "beneficiary": "Field Trial Unit",
  "registrationNo": "UP14 AG 0001",
  "isDummy": false,
  "lat": 28.67, "lng": 77.45,
  "speed": 14.3, "alt": 215, "sats": 9, "hdop": 1.1, "fix": true,
  "engineOn": true, "vib": 0.62,
  "lastSeen": 1778079158, "online": true,
  "distanceM": 1234.5, "engineSec": 480,
  "inFences": [3]
}
```

### `GET /api/summary`
Fleet-wide KPIs.
```json
{ "total": 36, "online": 36, "engineOn": 15, "inBreach": 0 }
```

### `GET /api/history?deviceId=<id>&since=<epoch_seconds>`
Returns up to 5 000 historical samples, ordered ascending. Used by the dashboard to draw the breadcrumb trail.

### `GET /api/alerts?limit=<n>`
Latest alerts, newest first. Shape:
```json
{ "id": 12, "device_id": "tractor-001", "ts": 1778079158,
  "type": "geofence_breach", "message": "Entered restricted zone: Block A",
  "lat": 28.67, "lng": 77.45, "geofence_id": 3, "acknowledged": 0 }
```

### `POST /api/alerts/:id/ack`
Mark an alert as acknowledged. No body needed.

## Geofences

### `GET /api/geofences`
List all geofences (active and inactive).

### `POST /api/geofences`
Create a fence.
```json
{ "name": "Block A", "type": "inclusion",
  "polygon": [[28.67,77.44],[28.68,77.44],[28.68,77.46],[28.67,77.46]],
  "districtId": 1 }
```
- `type` is `"inclusion"` (allowed area) or `"exclusion"` (restricted area).
- `polygon` must have ≥ 3 points.

### `PATCH /api/geofences/:id`
Body: `{ "active": true|false }` to enable/disable.

### `DELETE /api/geofences/:id`
Remove a fence.

## WebSocket

Connect to `/ws`. Server immediately sends a `snapshot` and then streams updates.

### Outbound messages

| `kind`              | When                                     | Payload                          |
|---------------------|------------------------------------------|----------------------------------|
| `snapshot`          | On connect                               | `districts, devices, geofences, alerts` |
| `telemetry`         | After every ingest (real or simulated)   | `state` (same shape as `/api/devices`) |
| `alert`             | When a new alert is recorded             | `alert`                          |
| `alert_ack`         | When `/api/alerts/:id/ack` is called     | `id`                             |
| `geofences_changed` | After any geofence create/update/delete  | —                                |

The server does not consume inbound messages.
