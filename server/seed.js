// Seeds districts and dummy subsidy-tractor devices on first run.
const db = require('./db');

const DISTRICTS = [
  // Uttar Pradesh — focus state
  { state: 'Uttar Pradesh', name: 'Ghaziabad',  lat: 28.6692, lng: 77.4538 },
  { state: 'Uttar Pradesh', name: 'Lucknow',    lat: 26.8467, lng: 80.9462 },
  { state: 'Uttar Pradesh', name: 'Kanpur',     lat: 26.4499, lng: 80.3319 },
  { state: 'Uttar Pradesh', name: 'Varanasi',   lat: 25.3176, lng: 82.9739 },
  { state: 'Uttar Pradesh', name: 'Agra',       lat: 27.1767, lng: 78.0081 },
  { state: 'Uttar Pradesh', name: 'Meerut',     lat: 28.9845, lng: 77.7064 },
  { state: 'Uttar Pradesh', name: 'Bareilly',   lat: 28.3670, lng: 79.4304 },
  { state: 'Uttar Pradesh', name: 'Gorakhpur',  lat: 26.7606, lng: 83.3732 },
  { state: 'Punjab',        name: 'Ludhiana',   lat: 30.9010, lng: 75.8573 },
  { state: 'Haryana',       name: 'Karnal',     lat: 29.6857, lng: 76.9905 },
  { state: 'Rajasthan',     name: 'Jaipur',     lat: 26.9124, lng: 75.7873 },
  { state: 'Madhya Pradesh',name: 'Indore',     lat: 22.7196, lng: 75.8577 },
  { state: 'Maharashtra',   name: 'Pune',       lat: 18.5204, lng: 73.8567 },
  { state: 'Bihar',         name: 'Patna',      lat: 25.5941, lng: 85.1376 },
];

const FIRST_NAMES = ['Ramesh','Suresh','Amit','Vikram','Rajesh','Mohan','Pradeep','Sanjay','Manoj','Dinesh','Harish','Naresh','Anil','Sunil','Kapil','Ajay','Deepak'];
const LAST_NAMES  = ['Kumar','Singh','Sharma','Yadav','Verma','Mishra','Tiwari','Gupta','Pandey','Chauhan','Saini','Meena','Patel','Rana'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function pad(n, w=4) { return String(n).padStart(w, '0'); }

function seedDistricts() {
  const ins = db.prepare('INSERT OR IGNORE INTO districts (state, name, lat, lng) VALUES (?, ?, ?, ?)');
  for (const d of DISTRICTS) ins.run(d.state, d.name, d.lat, d.lng);
}

function seedDevices() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM devices').get().c;
  if (count > 0) return;

  const districts = db.prepare('SELECT id, name FROM districts').all();
  const insDev = db.prepare(`INSERT INTO devices
    (id, name, district_id, beneficiary, registration_no, is_dummy, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const now = Math.floor(Date.now()/1000);

  let n = 1;
  for (const d of districts) {
    // 2-3 dummy tractors per district
    const k = 2 + (Math.random() < 0.5 ? 0 : 1);
    for (let i = 0; i < k; i++) {
      const id = `TR-${pad(n,4)}`;
      const beneficiary = `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`;
      const stateCode = ['UP','PB','HR','RJ','MP','MH','BR'][Math.floor(Math.random()*7)];
      const reg = `${stateCode}${10+Math.floor(Math.random()*89)} AG ${1000+Math.floor(Math.random()*8999)}`;
      insDev.run(id, `Tractor ${id}`, d.id, beneficiary, reg, 1, now);
      n++;
    }
  }
}

function attachRealDevice(realDeviceId) {
  // Ensure the real ESP32 device exists and is mapped to Ghaziabad.
  const ghaziabad = db.prepare(`SELECT id FROM districts WHERE name='Ghaziabad'`).get();
  if (!ghaziabad) return;

  const existing = db.prepare('SELECT id, district_id, is_dummy FROM devices WHERE id=?').get(realDeviceId);
  const now = Math.floor(Date.now()/1000);

  if (!existing) {
    db.prepare(`INSERT INTO devices (id, name, district_id, beneficiary, registration_no, is_dummy, created_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)`)
      .run(realDeviceId, `Tractor ${realDeviceId}`, ghaziabad.id, 'Field Trial Unit', 'UP14 AG 0001', now);
  } else {
    db.prepare('UPDATE devices SET district_id=?, is_dummy=0 WHERE id=?')
      .run(ghaziabad.id, realDeviceId);
  }
}

module.exports = { seedDistricts, seedDevices, attachRealDevice };
