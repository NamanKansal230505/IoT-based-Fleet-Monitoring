const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const db = require('./db');
const { pointInPolygon, haversine } = require('./geo');
const { seedDistricts, seedDevices, attachRealDevice } = require('./seed');
const sim = require('./sim');
const cfg = require('./config.json');

const REAL_DEVICE_ID = 'tractor-001';

// ---------- One-time seeding ----------
seedDistricts();
seedDevices();
attachRealDevice(REAL_DEVICE_ID);

// ---------- App ----------
const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}

// ---------- In-memory device state ----------
const deviceState = new Map();

function loadDeviceMeta() {
  const rows = db.prepare(`
    SELECT d.id, d.name, d.district_id, d.beneficiary, d.registration_no, d.is_dummy,
           ds.name AS district_name, ds.state AS state_name, ds.lat AS dlat, ds.lng AS dlng
    FROM devices d
    LEFT JOIN districts ds ON d.district_id = ds.id
  `).all();
  const map = new Map();
  for (const r of rows) map.set(r.id, r);
  return map;
}
let deviceMeta = loadDeviceMeta();

function getOrInitState(id) {
  if (!deviceState.has(id)) {
    const m = deviceMeta.get(id) || {};
    deviceState.set(id, {
      deviceId: id,
      name: m.name || id,
      districtId: m.district_id || null,
      district: m.district_name || null,
      state: m.state_name || null,
      beneficiary: m.beneficiary || null,
      registrationNo: m.registration_no || null,
      isDummy: !!m.is_dummy,
      lat: null, lng: null, speed: 0, alt: 0, sats: 0, hdop: 99,
      fix: false, engineOn: false, vib: 0,
      lastTs: 0, lastSeen: 0,
      inFences: new Set(),
      distanceM: 0, engineSec: 0, online: false,
    });
  }
  return deviceState.get(id);
}

function loadGeofences() {
  return db.prepare('SELECT id, name, type, polygon FROM geofences WHERE active=1').all()
    .map(r => ({ id: r.id, name: r.name, type: r.type, polygon: JSON.parse(r.polygon) }));
}

function logAlert(deviceId, ts, type, message, lat, lng, geofenceId = null) {
  const info = db.prepare(`INSERT INTO alerts (device_id, ts, type, message, lat, lng, geofence_id)
                           VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(deviceId, ts, type, message, lat, lng, geofenceId);
  const alert = { id: Number(info.lastInsertRowid), device_id: deviceId, ts, type, message, lat, lng, geofence_id: geofenceId, acknowledged: 0 };
  broadcast({ kind: 'alert', alert });
  return alert;
}

function publicState(st) {
  return {
    deviceId: st.deviceId, name: st.name,
    districtId: st.districtId, district: st.district, state: st.state,
    beneficiary: st.beneficiary, registrationNo: st.registrationNo, isDummy: st.isDummy,
    lat: st.lat, lng: st.lng,
    speed: st.speed, alt: st.alt,
    sats: st.sats, hdop: st.hdop, fix: st.fix,
    engineOn: st.engineOn, vib: st.vib,
    lastSeen: st.lastSeen, online: st.online,
    distanceM: st.distanceM, engineSec: st.engineSec,
    inFences: Array.from(st.inFences),
  };
}

// ---------- Core ingest (used by real telemetry POST + simulator) ----------
function ingest(t, source = 'real') {
  const id = String(t.deviceId || 'unknown');
  const ts = Math.floor(Date.now() / 1000);

  // For real devices we may auto-create the row if unknown
  if (!deviceMeta.has(id)) {
    db.prepare(`INSERT OR IGNORE INTO devices (id, name, district_id, is_dummy, created_at) VALUES (?, ?, NULL, 0, ?)`)
      .run(id, id, ts);
    deviceMeta = loadDeviceMeta();
  }

  const lat = (typeof t.lat === 'number') ? t.lat : null;
  const lng = (typeof t.lng === 'number') ? t.lng : null;
  const fix = t.fix ? 1 : 0;
  const engineOn = t.engineOn ? 1 : 0;

  // Persist (skip writing every dummy sample to keep DB lean)
  if (source === 'real') {
    db.prepare(`INSERT INTO telemetry
                (device_id, ts, lat, lng, speed, alt, hdop, sats, fix, engine_on, vib, raw)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, ts, lat, lng, t.speed || 0, t.alt || 0, t.hdop || 99, t.sats || 0,
           fix, engineOn, t.vib || 0, JSON.stringify(t));
  }

  const st = getOrInitState(id);
  const wasOnline = st.online;
  const prevEngine = st.engineOn;
  const prevLat = st.lat, prevLng = st.lng;

  if (lat != null && lng != null && prevLat != null && prevLng != null) {
    const d = haversine(prevLat, prevLng, lat, lng);
    if (d >= cfg.minMoveMeters) st.distanceM += d;
  }
  if (prevEngine && st.lastTs) st.engineSec += Math.min(60, ts - st.lastTs);

  st.lat = lat; st.lng = lng;
  st.speed = t.speed || 0; st.alt = t.alt || 0;
  st.sats = t.sats || 0; st.hdop = t.hdop || 99;
  st.fix = !!t.fix; st.engineOn = !!t.engineOn; st.vib = t.vib || 0;
  st.lastTs = ts; st.lastSeen = ts; st.online = true;

  if (prevEngine !== st.engineOn && source === 'real') {
    logAlert(id, ts, st.engineOn ? 'engine_on' : 'engine_off',
             st.engineOn ? 'Engine started' : 'Engine stopped', lat, lng);
  }
  if (!wasOnline && source === 'real') {
    logAlert(id, ts, 'online', 'Device online', lat, lng);
  }

  if (lat != null && lng != null) {
    const fences = loadGeofences();
    const nowIn = new Set();
    for (const f of fences) if (pointInPolygon(lat, lng, f.polygon)) nowIn.add(f.id);
    for (const f of fences) {
      const wasIn = st.inFences.has(f.id);
      const isIn = nowIn.has(f.id);
      if (f.type === 'exclusion' && !wasIn && isIn) {
        logAlert(id, ts, 'geofence_breach', `Entered restricted zone: ${f.name}`, lat, lng, f.id);
      } else if (f.type === 'inclusion' && wasIn && !isIn) {
        logAlert(id, ts, 'geofence_breach', `Left allowed zone: ${f.name}`, lat, lng, f.id);
      }
    }
    st.inFences = nowIn;
  }
  broadcast({ kind: 'telemetry', state: publicState(st) });
}

// ---------- Telemetry endpoint (real devices) ----------
app.post('/api/telemetry', (req, res) => {
  const t = req.body || {};
  if (cfg.deviceToken && t.token !== cfg.deviceToken) {
    return res.status(401).json({ error: 'invalid token' });
  }
  ingest(t, 'real');
  res.json({ ok: true });
});

// ---------- Read APIs ----------
app.get('/api/districts', (_req, res) => {
  const rows = db.prepare(`
    SELECT ds.id, ds.state, ds.name, ds.lat, ds.lng,
           COUNT(d.id) AS device_count
    FROM districts ds
    LEFT JOIN devices d ON d.district_id = ds.id
    GROUP BY ds.id
    ORDER BY ds.state, ds.name
  `).all();
  res.json(rows);
});

app.get('/api/devices', (req, res) => {
  const districtId = req.query.districtId ? parseInt(req.query.districtId, 10) : null;
  const rows = db.prepare(`
    SELECT d.id FROM devices d
    ${districtId ? 'WHERE d.district_id = ?' : ''}
    ORDER BY d.id
  `).all(...(districtId ? [districtId] : []));
  const out = rows.map(r => publicState(getOrInitState(r.id)));
  res.json(out);
});

app.get('/api/summary', (_req, res) => {
  const all = Array.from(deviceState.values());
  const total = all.length;
  const online = all.filter(s => s.online).length;
  const engineOn = all.filter(s => s.engineOn).length;
  const inBreach = all.filter(s => s.inFences && s.inFences.size > 0).length;
  res.json({ total, online, engineOn, inBreach });
});

app.get('/api/history', (req, res) => {
  const id = String(req.query.deviceId || '');
  const since = parseInt(req.query.since || (Math.floor(Date.now()/1000) - 24*3600), 10);
  const rows = db.prepare(`SELECT ts, lat, lng, speed, engine_on FROM telemetry
                           WHERE device_id=? AND ts>=? AND lat IS NOT NULL
                           ORDER BY ts ASC LIMIT 5000`).all(id, since);
  res.json(rows);
});

app.get('/api/alerts', (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit || '100', 10));
  const rows = db.prepare(`SELECT * FROM alerts ORDER BY id DESC LIMIT ?`).all(limit);
  res.json(rows);
});

app.post('/api/alerts/:id/ack', (req, res) => {
  db.prepare('UPDATE alerts SET acknowledged=1 WHERE id=?').run(parseInt(req.params.id, 10));
  broadcast({ kind: 'alert_ack', id: parseInt(req.params.id, 10) });
  res.json({ ok: true });
});

// ---------- Geofences ----------
app.get('/api/geofences', (_req, res) => {
  const rows = db.prepare('SELECT id, name, type, polygon, active, district_id FROM geofences').all();
  res.json(rows.map(r => ({ ...r, polygon: JSON.parse(r.polygon), active: !!r.active })));
});

app.post('/api/geofences', (req, res) => {
  const { name, type, polygon, districtId } = req.body || {};
  if (!name || !['inclusion','exclusion'].includes(type) || !Array.isArray(polygon) || polygon.length < 3) {
    return res.status(400).json({ error: 'invalid geofence' });
  }
  const info = db.prepare(`INSERT INTO geofences (name, type, polygon, active, district_id, created_at)
                           VALUES (?, ?, ?, 1, ?, ?)`)
    .run(name, type, JSON.stringify(polygon), districtId || null, Math.floor(Date.now()/1000));
  broadcast({ kind: 'geofences_changed' });
  res.json({ id: Number(info.lastInsertRowid) });
});

app.delete('/api/geofences/:id', (req, res) => {
  db.prepare('DELETE FROM geofences WHERE id=?').run(parseInt(req.params.id, 10));
  broadcast({ kind: 'geofences_changed' });
  res.json({ ok: true });
});

app.patch('/api/geofences/:id', (req, res) => {
  const { active } = req.body || {};
  if (typeof active === 'boolean') {
    db.prepare('UPDATE geofences SET active=? WHERE id=?').run(active ? 1 : 0, parseInt(req.params.id, 10));
  }
  broadcast({ kind: 'geofences_changed' });
  res.json({ ok: true });
});

// ---------- Offline detector ----------
setInterval(() => {
  const now = Math.floor(Date.now()/1000);
  for (const st of deviceState.values()) {
    if (st.online && !st.isDummy && now - st.lastSeen > cfg.offlineAfterSec) {
      st.online = false;
      logAlert(st.deviceId, now, 'offline', 'Device went offline', st.lat, st.lng);
      broadcast({ kind: 'telemetry', state: publicState(st) });
    }
  }
}, 5000);

// ---------- Dummy simulator ----------
sim.init();
setInterval(() => {
  const samples = sim.tick();
  for (const s of samples) ingest(s, 'sim');
}, 5000);

// Pre-warm dummy state so they appear immediately
for (const id of deviceMeta.keys()) getOrInitState(id);
// Run one immediate sim tick
setTimeout(() => { for (const s of sim.tick()) ingest(s, 'sim'); }, 200);

// ---------- WebSocket initial snapshot ----------
wss.on('connection', ws => {
  const districts = db.prepare(`
    SELECT ds.id, ds.state, ds.name, ds.lat, ds.lng, COUNT(d.id) AS device_count
    FROM districts ds LEFT JOIN devices d ON d.district_id = ds.id
    GROUP BY ds.id ORDER BY ds.state, ds.name
  `).all();
  const snapshot = {
    kind: 'snapshot',
    districts,
    devices: Array.from(deviceState.values()).map(publicState),
    geofences: db.prepare('SELECT id, name, type, polygon, active, district_id FROM geofences').all()
      .map(r => ({ ...r, polygon: JSON.parse(r.polygon), active: !!r.active })),
    alerts: db.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT 50').all(),
  };
  ws.send(JSON.stringify(snapshot));
});

server.listen(cfg.port, () => {
  console.log(`AgriTracker server on http://localhost:${cfg.port}`);
  console.log(`Devices loaded: ${deviceMeta.size}`);
});
