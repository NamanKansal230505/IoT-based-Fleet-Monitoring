// ====== State ======
const S = {
  districts: [],
  selectedDistrictId: null,
  devices: new Map(),       // id -> publicState
  selectedDevice: null,
  geofences: [],
  drawnPolygon: null,
  speedHistory: [],
  alerts: [],
};

const $ = id => document.getElementById(id);
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = ts => new Date(ts*1000).toLocaleTimeString();
const fmtAgo = ts => {
  if (!ts) return '—';
  const s = Math.floor(Date.now()/1000 - ts);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  return Math.floor(s/3600) + 'h ago';
};
const fmtDur = sec => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

// ====== Map ======
const map = L.map('map', { zoomControl: true }).setView([22.9734, 78.6569], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© OpenStreetMap'
}).addTo(map);

const drawnItems = new L.FeatureGroup().addTo(map);
const fenceLayers = new L.FeatureGroup().addTo(map);
const trail = L.polyline([], { color: '#0b2545', weight: 3, opacity: 0.7 }).addTo(map);
const vehicleMarkers = new Map(); // id -> Leaflet marker

const drawControl = new L.Control.Draw({
  edit: { featureGroup: drawnItems, edit: false, remove: true },
  draw: {
    polygon: { allowIntersection:false, showArea:true, shapeOptions: { color: '#0b2545' } },
    rectangle: { shapeOptions: { color: '#0b2545' } },
    polyline:false, circle:false, marker:false, circlemarker:false
  }
});
map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, e => {
  drawnItems.clearLayers();
  drawnItems.addLayer(e.layer);
  const latlngs = e.layer.getLatLngs()[0] || e.layer.getLatLngs();
  S.drawnPolygon = latlngs.map(p => [p.lat, p.lng]);
  $('fenceSave').disabled = false;
});
map.on(L.Draw.Event.DELETED, () => {
  S.drawnPolygon = null;
  $('fenceSave').disabled = true;
});

function vehicleIcon(d) {
  const isReal = !d.isDummy;
  const offline = !d.online;
  const fill = offline ? '#b3261e' : (isReal ? '#1b7a3e' : '#0b2545');
  const ring = d.engineOn && !offline ? '#c8a64b' : '#ffffff';
  const pulse = d.engineOn && !offline ? `box-shadow:0 0 0 3px rgba(200,166,75,.45);` : '';
  return L.divIcon({
    className: 'vmark',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${fill}; border:2px solid ${ring}; ${pulse}"></div>`,
    iconSize: [18,18], iconAnchor: [9,9],
  });
}

// ====== Chart ======
const speedChart = new Chart($('speedChart').getContext('2d'), {
  type: 'line',
  data: { labels: [], datasets: [{ label:'km/h', data:[], borderColor:'#0b2545',
          backgroundColor:'rgba(11,37,69,.10)', tension:.3, fill:true, pointRadius:0, borderWidth: 2 }] },
  options: { responsive:true, animation:false,
    scales: { x:{ ticks:{ color:'#5a6679', font:{size:10} }, grid:{ color:'#eef0f5'} },
              y:{ ticks:{ color:'#5a6679', font:{size:10} }, grid:{ color:'#eef0f5'}, beginAtZero:true } },
    plugins: { legend:{ display:false } } }
});

// ====== Renders ======
function renderDistricts() {
  const q = $('districtSearch').value.toLowerCase();
  const list = $('districtList');
  const counts = countByDistrict();
  const realDistrictIds = new Set(
    Array.from(S.devices.values()).filter(d => !d.isDummy && d.districtId).map(d => d.districtId)
  );

  list.innerHTML = '';
  for (const d of S.districts) {
    if (q && !(d.name.toLowerCase().includes(q) || d.state.toLowerCase().includes(q))) continue;
    const c = counts.get(d.id) || { total:0, online:0 };
    const has = realDistrictIds.has(d.id);
    const el = document.createElement('div');
    el.className = 'district-card' + (S.selectedDistrictId === d.id ? ' active' : '') + (has ? ' has-real' : '');
    el.innerHTML = `
      <div class="dn">${escapeHtml(d.name)} ${has ? '<span class="real-pill">LIVE</span>' : ''}</div>
      <div class="ds">${escapeHtml(d.state)}</div>
      <div class="dc">${c.total} vehicles · <b style="color:var(--good)">${c.online}</b> online</div>`;
    el.onclick = () => selectDistrict(d.id);
    list.appendChild(el);
  }
}

function countByDistrict() {
  const m = new Map();
  for (const d of S.devices.values()) {
    if (!d.districtId) continue;
    const c = m.get(d.districtId) || { total:0, online:0 };
    c.total++; if (d.online) c.online++;
    m.set(d.districtId, c);
  }
  return m;
}

function selectDistrict(id) {
  S.selectedDistrictId = id;
  S.selectedDevice = null;
  const d = S.districts.find(x => x.id === id);
  $('mapTitle').textContent = d ? `${d.name}, ${d.state}` : 'All districts';
  $('vehicleHeadTitle').textContent = d ? `Vehicles in ${d.name}` : 'Vehicles';
  if (d) map.setView([d.lat, d.lng], 11);
  renderDistricts();
  renderVehicles();
  renderMapMarkers();
  renderDetail();
}

function renderVehicles() {
  const list = $('vehicleList');
  list.innerHTML = '';
  const filtered = Array.from(S.devices.values())
    .filter(v => !S.selectedDistrictId || v.districtId === S.selectedDistrictId)
    .sort((a,b) => (b.online - a.online) || a.deviceId.localeCompare(b.deviceId));

  if (!filtered.length) {
    list.innerHTML = '<div class="empty">No vehicles registered.</div>';
    return;
  }
  for (const v of filtered) {
    const el = document.createElement('div');
    el.className = 'vehicle-row' + (S.selectedDevice === v.deviceId ? ' active' : '');
    el.innerHTML = `
      <div>
        <div class="vid">${escapeHtml(v.deviceId)} ${v.isDummy ? '' : '<span class="real-pill">LIVE</span>'}</div>
        <div class="vsub">${escapeHtml(v.beneficiary || '—')} · ${escapeHtml(v.registrationNo || '—')}</div>
      </div>
      <div class="vstate">
        <span class="dot-engine ${v.engineOn ? 'on' : ''}"></span>
        <span class="badge ${v.online ? 'online' : 'offline'}">${v.online ? 'Online' : 'Offline'}</span>
      </div>`;
    el.onclick = () => selectDevice(v.deviceId);
    list.appendChild(el);
  }
}

function renderMapMarkers() {
  // Clear & redraw markers visible for current filter
  for (const m of vehicleMarkers.values()) map.removeLayer(m);
  vehicleMarkers.clear();
  for (const v of S.devices.values()) {
    if (S.selectedDistrictId && v.districtId !== S.selectedDistrictId) continue;
    if (v.lat == null || v.lng == null) continue;
    const m = L.marker([v.lat, v.lng], { icon: vehicleIcon(v) })
      .bindTooltip(`<b>${escapeHtml(v.deviceId)}</b><br>${escapeHtml(v.beneficiary || '')}<br>${v.engineOn ? 'Engine ON' : 'Engine OFF'} · ${(v.speed||0).toFixed(1)} km/h`);
    m.on('click', () => selectDevice(v.deviceId));
    m.addTo(map);
    vehicleMarkers.set(v.deviceId, m);
  }
}

function selectDevice(id) {
  S.selectedDevice = id;
  S.speedHistory = [];
  trail.setLatLngs([]);
  loadHistory();
  renderVehicles();
  renderDetail();
  const v = S.devices.get(id);
  if (v && v.lat != null) map.setView([v.lat, v.lng], 15);
}

function renderDetail() {
  const id = S.selectedDevice;
  const v = id ? S.devices.get(id) : null;
  if (!v) {
    $('detailEmpty').hidden = false;
    $('detailBody').hidden = true;
    return;
  }
  $('detailEmpty').hidden = true;
  $('detailBody').hidden = false;

  $('dId').textContent = v.deviceId;
  $('dDistrict').textContent = v.district ? `${v.district}, ${v.state}` : 'Unassigned';
  $('dBene').textContent = v.beneficiary || '—';
  $('dReg').textContent = v.registrationNo || '—';
  const badge = $('dBadge');
  badge.className = 'badge ' + (v.online ? 'online' : 'offline');
  badge.textContent = v.online ? 'Online' : 'Offline';

  $('dEngine').textContent = v.engineOn ? 'ON' : 'OFF';
  $('dEngine').style.color = v.engineOn ? 'var(--good)' : 'var(--warn)';
  $('dSpeed').textContent  = (v.speed||0).toFixed(1) + ' km/h';
  $('dLoc').textContent    = (v.lat!=null && v.lng!=null) ? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}` : '—';
  $('dSats').textContent   = v.sats ?? '—';
  $('dHdop').textContent   = (v.hdop||0).toFixed(2);
  $('dVib').textContent    = (v.vib||0).toFixed(2);
  $('dSeen').textContent   = fmtAgo(v.lastSeen);
  $('dSource').textContent = v.isDummy ? 'Simulated' : 'Live (ESP32 + GPS + IMU)';

  $('dDist').textContent = ((v.distanceM||0)/1000).toFixed(2) + ' km';
  $('dRun').textContent  = fmtDur(v.engineSec || 0);
  $('dFences').textContent = (v.inFences||[]).length;

  // Trail (push live point if same vehicle)
  if (v.lat != null) {
    trail.addLatLng([v.lat, v.lng]);
    const pts = trail.getLatLngs();
    if (pts.length > 500) trail.setLatLngs(pts.slice(-500));
    S.speedHistory.push({ t: v.lastSeen, v: v.speed || 0 });
    if (S.speedHistory.length > 30) S.speedHistory.shift();
    speedChart.data.labels = S.speedHistory.map(p => fmtTime(p.t));
    speedChart.data.datasets[0].data = S.speedHistory.map(p => p.v);
    speedChart.update('none');
  }
}

function renderFences() {
  fenceLayers.clearLayers();
  const list = $('fenceList');
  list.innerHTML = '';
  for (const f of S.geofences) {
    const color = f.type === 'exclusion' ? '#b3261e' : '#1b7a3e';
    L.polygon(f.polygon, { color, weight: 2, fillOpacity: .12, dashArray: f.active ? null : '6,6' })
      .bindTooltip(`${f.name} (${f.type})`).addTo(fenceLayers);
    const li = document.createElement('li');
    li.innerHTML = `<span><b>${escapeHtml(f.name)}</b> · <span class="ftype ${f.type}">${f.type}</span> ${f.active ? '' : '<i style="color:var(--muted)">(disabled)</i>'}</span>
      <span class="actions">
        <button class="btn" data-toggle="${f.id}">${f.active ? 'Disable' : 'Enable'}</button>
        <button class="btn" data-del="${f.id}">Delete</button>
      </span>`;
    list.appendChild(li);
  }
  list.querySelectorAll('button[data-del]').forEach(b => b.onclick = () => deleteFence(b.dataset.del));
  list.querySelectorAll('button[data-toggle]').forEach(b => b.onclick = () => toggleFence(b.dataset.toggle));
}

function renderAlertsPanel() {
  const ul = $('alertsList');
  ul.innerHTML = '';
  for (const a of S.alerts) addAlertRow(a, false);
}
function addAlertRow(a, prepend = true) {
  const ul = $('alertsList');
  const li = document.createElement('li');
  li.className = a.type + (a.acknowledged ? ' ack' : '');
  li.dataset.id = a.id;
  li.innerHTML = `<div>${escapeHtml(a.message)}</div>
    <div class="meta"><span>${a.type}</span><span>${fmtTime(a.ts)} · ${escapeHtml(a.device_id)}</span></div>`;
  li.onclick = () => ackAlert(a.id);
  if (prepend) ul.prepend(li); else ul.appendChild(li);
}

function renderSummary() {
  const all = Array.from(S.devices.values());
  $('sTotal').textContent = all.length;
  $('sOnline').textContent = all.filter(d => d.online).length;
  $('sEngine').textContent = all.filter(d => d.engineOn).length;
  $('sBreach').textContent = all.filter(d => (d.inFences||[]).length).length;
}

// ====== API ======
async function api(p, opts = {}) {
  const r = await fetch(p, { headers: {'Content-Type':'application/json'}, ...opts });
  if (!r.ok) throw new Error(p + ' ' + r.status);
  return r.json();
}

async function loadHistory() {
  if (!S.selectedDevice) return;
  try {
    const rows = await api('/api/history?deviceId=' + encodeURIComponent(S.selectedDevice));
    trail.setLatLngs(rows.filter(r => r.lat && r.lng).map(r => [r.lat, r.lng]));
  } catch {}
}
async function saveFence() {
  const name = $('fenceName').value.trim();
  const type = $('fenceType').value;
  if (!name || !S.drawnPolygon) return;
  await api('/api/geofences', { method:'POST', body: JSON.stringify({ name, type, polygon: S.drawnPolygon, districtId: S.selectedDistrictId }) });
  $('fenceName').value = '';
  drawnItems.clearLayers();
  S.drawnPolygon = null;
  $('fenceSave').disabled = true;
}
async function deleteFence(id) {
  if (!confirm('Delete this geofence?')) return;
  await api('/api/geofences/' + id, { method:'DELETE' });
}
async function toggleFence(id) {
  const f = S.geofences.find(x => x.id == id);
  if (!f) return;
  await api('/api/geofences/' + id, { method:'PATCH', body: JSON.stringify({ active: !f.active }) });
}
async function ackAlert(id) { await api('/api/alerts/' + id + '/ack', { method:'POST' }); }
async function ackAllAlerts() {
  document.querySelectorAll('#alertsList li:not(.ack)').forEach(li => ackAlert(li.dataset.id));
}

$('fenceSave').onclick = saveFence;
$('ackAll').onclick = ackAllAlerts;
$('districtSearch').oninput = renderDistricts;

// ====== WebSocket ======
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { $('connBadge').className='badge online'; $('connBadge').textContent='Live'; };
  ws.onclose = () => { $('connBadge').className='badge offline'; $('connBadge').textContent='Reconnecting…'; setTimeout(connectWS, 1500); };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.kind === 'snapshot') {
      S.districts = m.districts || [];
      S.geofences = m.geofences || [];
      S.alerts = m.alerts || [];
      for (const d of (m.devices || [])) S.devices.set(d.deviceId, d);
      renderDistricts(); renderVehicles(); renderMapMarkers();
      renderFences(); renderAlertsPanel(); renderSummary();
    } else if (m.kind === 'telemetry') {
      S.devices.set(m.state.deviceId, m.state);
      // update marker without nuking everything
      const mk = vehicleMarkers.get(m.state.deviceId);
      if (mk) {
        if (m.state.lat != null) mk.setLatLng([m.state.lat, m.state.lng]);
        mk.setIcon(vehicleIcon(m.state));
        mk.setTooltipContent(`<b>${escapeHtml(m.state.deviceId)}</b><br>${escapeHtml(m.state.beneficiary || '')}<br>${m.state.engineOn ? 'Engine ON' : 'Engine OFF'} · ${(m.state.speed||0).toFixed(1)} km/h`);
      } else if (!S.selectedDistrictId || m.state.districtId === S.selectedDistrictId) {
        renderMapMarkers();
      }
      if (m.state.deviceId === S.selectedDevice) renderDetail();
      renderVehicles(); renderSummary();
      $('lastSync').textContent = new Date().toLocaleTimeString();
    } else if (m.kind === 'alert') {
      S.alerts.unshift(m.alert);
      addAlertRow(m.alert, true);
    } else if (m.kind === 'alert_ack') {
      const li = document.querySelector(`#alertsList li[data-id="${m.id}"]`);
      if (li) li.classList.add('ack');
    } else if (m.kind === 'geofences_changed') {
      api('/api/geofences').then(g => { S.geofences = g; renderFences(); });
    }
  };
}

// ====== Boot ======
function tickClock() { $('sessionTime').textContent = new Date().toLocaleString(); }
tickClock(); setInterval(tickClock, 1000);
setInterval(() => { if (S.selectedDevice) renderDetail(); }, 1000); // refresh "ago"
connectWS();
