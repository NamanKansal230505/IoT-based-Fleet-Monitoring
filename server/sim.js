// Simulator for dummy devices: walks each device near its district centre
// and toggles engine occasionally so the dashboard feels alive.
const db = require('./db');

const dummyState = new Map(); // id -> { lat,lng,heading,engineOn,lastToggle }

function init() {
  const rows = db.prepare(`
    SELECT d.id, d.is_dummy, ds.lat, ds.lng
    FROM devices d JOIN districts ds ON d.district_id = ds.id
    WHERE d.is_dummy = 1
  `).all();
  for (const r of rows) {
    // jitter starting position within ~3km of district centre
    const lat = r.lat + (Math.random() - 0.5) * 0.05;
    const lng = r.lng + (Math.random() - 0.5) * 0.05;
    dummyState.set(r.id, {
      lat, lng,
      heading: Math.random() * 360,
      engineOn: Math.random() < 0.4,
      lastToggle: Date.now(),
    });
  }
}

// Returns array of fake telemetry payloads at this tick.
function tick() {
  const out = [];
  const now = Date.now();
  for (const [id, s] of dummyState.entries()) {
    // Randomly toggle engine roughly every 30-90s
    if (now - s.lastToggle > 30000 + Math.random() * 60000) {
      s.engineOn = !s.engineOn;
      s.lastToggle = now;
    }
    let speed = 0;
    if (s.engineOn) {
      // gentle wander
      s.heading += (Math.random() - 0.5) * 30;
      speed = 8 + Math.random() * 22; // 8-30 km/h
      const stepM = (speed * 1000 / 3600) * 5; // 5s tick
      const dLat = (stepM / 111320) * Math.cos(s.heading * Math.PI/180);
      const dLng = (stepM / (111320 * Math.cos(s.lat*Math.PI/180))) * Math.sin(s.heading * Math.PI/180);
      s.lat += dLat;
      s.lng += dLng;
    }
    out.push({
      deviceId: id,
      lat: s.lat,
      lng: s.lng,
      speed,
      sats: 7 + Math.floor(Math.random()*5),
      hdop: 0.8 + Math.random()*0.6,
      fix: true,
      engineOn: s.engineOn,
      vib: s.engineOn ? 0.5 + Math.random()*0.4 : 0.05 + Math.random()*0.1,
      alt: 200 + Math.random()*30,
    });
  }
  return out;
}

module.exports = { init, tick };
