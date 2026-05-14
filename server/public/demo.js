// ============================================================
// Demo mode — runs the whole backend in the browser.
// Activates automatically when /api/districts is unreachable
// (i.e. on a static-only deploy like Vercel).
// ============================================================
window.DEMO = (function () {
  const DISTRICTS = [
    { id: 1,  state: 'Uttar Pradesh',  name: 'Ghaziabad', lat: 28.6692, lng: 77.4538 },
    { id: 2,  state: 'Uttar Pradesh',  name: 'Lucknow',   lat: 26.8467, lng: 80.9462 },
    { id: 3,  state: 'Uttar Pradesh',  name: 'Kanpur',    lat: 26.4499, lng: 80.3319 },
    { id: 4,  state: 'Uttar Pradesh',  name: 'Varanasi',  lat: 25.3176, lng: 82.9739 },
    { id: 5,  state: 'Uttar Pradesh',  name: 'Agra',      lat: 27.1767, lng: 78.0081 },
    { id: 6,  state: 'Uttar Pradesh',  name: 'Meerut',    lat: 28.9845, lng: 77.7064 },
    { id: 7,  state: 'Uttar Pradesh',  name: 'Bareilly',  lat: 28.3670, lng: 79.4304 },
    { id: 8,  state: 'Uttar Pradesh',  name: 'Gorakhpur', lat: 26.7606, lng: 83.3732 },
    { id: 9,  state: 'Punjab',         name: 'Ludhiana',  lat: 30.9010, lng: 75.8573 },
    { id: 10, state: 'Haryana',        name: 'Karnal',    lat: 29.6857, lng: 76.9905 },
    { id: 11, state: 'Rajasthan',      name: 'Jaipur',    lat: 26.9124, lng: 75.7873 },
    { id: 12, state: 'Madhya Pradesh', name: 'Indore',    lat: 22.7196, lng: 75.8577 },
    { id: 13, state: 'Maharashtra',    name: 'Pune',      lat: 18.5204, lng: 73.8567 },
    { id: 14, state: 'Bihar',          name: 'Patna',     lat: 25.5941, lng: 85.1376 },
  ];
  const FIRST = ['Ramesh','Suresh','Amit','Vikram','Rajesh','Mohan','Pradeep','Sanjay','Manoj','Dinesh','Harish','Naresh','Anil','Sunil','Kapil','Ajay','Deepak'];
  const LAST  = ['Kumar','Singh','Sharma','Yadav','Verma','Mishra','Tiwari','Gupta','Pandey','Chauhan','Saini','Meena','Patel','Rana'];
  const CODES = ['UP','PB','HR','RJ','MP','MH','BR'];
  const rand  = a => a[Math.floor(Math.random() * a.length)];
  const pad   = (n,w=4) => String(n).padStart(w,'0');

  // ---------- Seed devices (mirrors server/seed.js) ----------
  const devices = []; // metadata rows
  let n = 1;
  for (const d of DISTRICTS) {
    const k = 2 + (Math.random() < 0.5 ? 0 : 1);
    for (let i = 0; i < k; i++) {
      const id = `TR-${pad(n,4)}`;
      devices.push({
        id, name: `Tractor ${id}`, district_id: d.id,
        beneficiary: `${rand(FIRST)} ${rand(LAST)}`,
        registration_no: `${rand(CODES)}${10+Math.floor(Math.random()*89)} AG ${1000+Math.floor(Math.random()*8999)}`,
        is_dummy: 1,
      });
      n++;
    }
  }
  // "Real" pilot unit in Ghaziabad — same as attachRealDevice()
  devices.push({
    id: 'tractor-001', name: 'Tractor tractor-001', district_id: 1,
    beneficiary: 'Field Trial Unit', registration_no: 'UP14 AG 0001', is_dummy: 0,
  });

  // ---------- Geo helpers (mirrors server/geo.js) ----------
  function pointInPolygon(lat, lng, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const yi = poly[i][0], xi = poly[i][1];
      const yj = poly[j][0], xj = poly[j][1];
      const hit = ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ---------- Per-device runtime state ----------
  const state = new Map(); // id -> publicState
  const sim   = new Map(); // id -> { lat,lng,heading,engineOn,lastToggle } (dummies only)

  for (const d of devices) {
    const dist = DISTRICTS.find(x => x.id === d.district_id) || {};
    state.set(d.id, {
      deviceId: d.id, name: d.name,
      districtId: d.district_id, district: dist.name || null, state: dist.state || null,
      beneficiary: d.beneficiary, registrationNo: d.registration_no, isDummy: !!d.is_dummy,
      lat: null, lng: null, speed: 0, alt: 0, sats: 0, hdop: 99,
      fix: false, engineOn: false, vib: 0,
      lastTs: 0, lastSeen: 0,
      inFences: [],
      distanceM: 0, engineSec: 0, online: false,
    });
    if (d.is_dummy) {
      sim.set(d.id, {
        lat: dist.lat + (Math.random()-0.5)*0.05,
        lng: dist.lng + (Math.random()-0.5)*0.05,
        heading: Math.random() * 360,
        engineOn: Math.random() < 0.4,
        lastToggle: Date.now(),
      });
    }
  }
  // Pilot unit also wanders so the LIVE pill is visible
  {
    const dist = DISTRICTS[0];
    sim.set('tractor-001', {
      lat: dist.lat + (Math.random()-0.5)*0.02,
      lng: dist.lng + (Math.random()-0.5)*0.02,
      heading: Math.random() * 360,
      engineOn: true,
      lastToggle: Date.now(),
    });
  }

  // ---------- Geofences + alerts (in memory) ----------
  let nextFenceId = 1, nextAlertId = 1;
  const geofences = [];
  const alerts = [];

  // ---------- Callbacks supplied by app.js ----------
  let cb = { telemetry: () => {}, alert: () => {}, alertAck: () => {}, geofencesChanged: () => {} };

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
      inFences: st.inFences.slice(),
    };
  }

  function logAlert(deviceId, ts, type, message, lat, lng, geofence_id = null) {
    const a = { id: nextAlertId++, device_id: deviceId, ts, type, message, lat, lng, geofence_id, acknowledged: 0 };
    alerts.unshift(a);
    if (alerts.length > 500) alerts.pop();
    cb.alert(a);
    return a;
  }

  // ---------- Per-tick ingest ----------
  function ingestTick() {
    const now = Date.now();
    const tsSec = Math.floor(now / 1000);
    for (const [id, s] of sim.entries()) {
      const st = state.get(id);
      if (!st) continue;

      if (now - s.lastToggle > 30000 + Math.random()*60000) {
        s.engineOn = !s.engineOn;
        s.lastToggle = now;
        logAlert(id, tsSec, s.engineOn ? 'engine_on' : 'engine_off',
                 s.engineOn ? 'Engine started' : 'Engine stopped', s.lat, s.lng);
      }
      let speed = 0;
      if (s.engineOn) {
        s.heading += (Math.random()-0.5) * 30;
        speed = 8 + Math.random() * 22;
        const stepM = (speed * 1000 / 3600) * 5;
        const dLat = (stepM / 111320) * Math.cos(s.heading * Math.PI/180);
        const dLng = (stepM / (111320 * Math.cos(s.lat * Math.PI/180))) * Math.sin(s.heading * Math.PI/180);
        s.lat += dLat; s.lng += dLng;
      }

      const prevLat = st.lat, prevLng = st.lng;
      const prevEngine = st.engineOn;
      const wasOnline = st.online;

      if (prevLat != null && prevLng != null) {
        const d = haversine(prevLat, prevLng, s.lat, s.lng);
        if (d >= 5) st.distanceM += d;
      }
      if (prevEngine && st.lastTs) st.engineSec += Math.min(60, tsSec - st.lastTs);

      st.lat = s.lat; st.lng = s.lng;
      st.speed = speed;
      st.alt = 200 + Math.random()*30;
      st.sats = 7 + Math.floor(Math.random()*5);
      st.hdop = 0.8 + Math.random()*0.6;
      st.fix = true;
      st.engineOn = s.engineOn;
      st.vib = s.engineOn ? 0.5 + Math.random()*0.4 : 0.05 + Math.random()*0.1;
      st.lastTs = tsSec; st.lastSeen = tsSec; st.online = true;

      if (!wasOnline) logAlert(id, tsSec, 'online', 'Device online', s.lat, s.lng);

      // Geofence eval
      const nowIn = [];
      for (const f of geofences) {
        if (!f.active) continue;
        if (pointInPolygon(s.lat, s.lng, f.polygon)) nowIn.push(f.id);
      }
      for (const f of geofences) {
        if (!f.active) continue;
        const wasIn = st.inFences.includes(f.id);
        const isIn  = nowIn.includes(f.id);
        if (f.type === 'exclusion' && !wasIn && isIn) {
          logAlert(id, tsSec, 'geofence_breach', `Entered restricted zone: ${f.name}`, s.lat, s.lng, f.id);
        } else if (f.type === 'inclusion' && wasIn && !isIn) {
          logAlert(id, tsSec, 'geofence_breach', `Left allowed zone: ${f.name}`, s.lat, s.lng, f.id);
        }
      }
      st.inFences = nowIn;

      cb.telemetry(publicState(st));
    }
  }

  // ---------- Public API (replaces /api/* and WS) ----------
  function snapshot() {
    const districtCounts = new Map();
    for (const d of devices) {
      const c = districtCounts.get(d.district_id) || 0;
      districtCounts.set(d.district_id, c + 1);
    }
    return {
      districts: DISTRICTS.map(d => ({ ...d, device_count: districtCounts.get(d.id) || 0 })),
      devices: Array.from(state.values()).map(publicState),
      geofences: geofences.map(f => ({ ...f })),
      alerts: alerts.slice(0, 50),
    };
  }

  function addGeofence({ name, type, polygon, districtId }) {
    const f = {
      id: nextFenceId++, name, type, polygon,
      active: true, district_id: districtId || null,
    };
    geofences.push(f);
    cb.geofencesChanged();
    return f.id;
  }
  function deleteGeofence(id) {
    const i = geofences.findIndex(f => f.id == id);
    if (i >= 0) geofences.splice(i, 1);
    cb.geofencesChanged();
  }
  function toggleGeofence(id, active) {
    const f = geofences.find(x => x.id == id);
    if (f) f.active = !!active;
    cb.geofencesChanged();
  }
  function ackAlert(id) {
    const a = alerts.find(x => x.id == id);
    if (a) a.acknowledged = 1;
    cb.alertAck(Number(id));
  }
  function getHistory(deviceId) {
    // No persisted history in demo mode — return current point only.
    const st = state.get(deviceId);
    if (!st || st.lat == null) return [];
    return [{ ts: st.lastSeen, lat: st.lat, lng: st.lng, speed: st.speed, engine_on: st.engineOn ? 1 : 0 }];
  }

  function start(callbacks) {
    cb = Object.assign(cb, callbacks || {});
    ingestTick(); // immediate
    setInterval(ingestTick, 5000);
    // Offline detector — dummies stay online; only flips state if sim ever stops.
    setInterval(() => {
      const now = Math.floor(Date.now()/1000);
      for (const st of state.values()) {
        if (st.online && now - st.lastSeen > 30) {
          st.online = false;
          logAlert(st.deviceId, now, 'offline', 'Device went offline', st.lat, st.lng);
          cb.telemetry(publicState(st));
        }
      }
    }, 5000);
  }

  return {
    start, snapshot,
    addGeofence, deleteGeofence, toggleGeofence,
    ackAlert, getHistory,
  };
})();
