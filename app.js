// StrideMate — main JS (vanilla)
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const screens = [
  {id:'run', title:'Run'},
  {id:'log', title:'Log'},
  {id:'intervals', title:'Intervals'},
  {id:'tools', title:'Tools'},
  {id:'about', title:'About'},
];

// Tabs
const tabsEl = $('#tabs');
screens.forEach(s => {
  const b = document.createElement('button');
  b.textContent = s.title;
  b.dataset.target = s.id;
  b.className = 'tab';
  if (s.id==='run') b.classList.add('active');
  b.addEventListener('click', () => {
    $$('.tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    $$('.screen').forEach(sc => sc.classList.remove('active'));
    $('#screen-'+s.id).classList.add('active');
  });
  tabsEl.appendChild(b);
});

// Utils
const fmt2 = n => (n<10?'0':'') + Math.floor(n);
const fmtTime = s => {
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const sec = Math.floor(s%60);
  return (h?`${h}:${fmt2(m)}:${fmt2(sec)}`:`${fmt2(m)}:${fmt2(sec)}`);
};
const parseMMSS = str => {
  const parts = (str||'').split(':').map(n=>parseInt(n,10));
  if (parts.length===2) return parts[0]*60 + parts[1];
  if (parts.length===3) return parts[0]*3600 + parts[1]*60 + parts[2];
  return NaN;
};
const km = m => m/1000;
const hav = (a) => Math.sin(a/2)**2;
const R = 6371000;
function distance(lat1, lon1, lat2, lon2){
  const phi1 = lat1*Math.PI/180, phi2 = lat2*Math.PI/180;
  const dphi = (lat2-lat1)*Math.PI/180, dl = (lon2-lon1)*Math.PI/180;
  const h = hav(dphi) + Math.cos(phi1)*Math.cos(phi2)*hav(dl);
  return 2*R*Math.asin(Math.sqrt(h));
}
function speak(text){
  if (!$('#opt-voice').checked) return;
  try { window.speechSynthesis.cancel(); new SpeechSynthesisUtterance(); } catch {}
  const u = new SpeechSynthesisUtterance(text);
  speechSynthesis.speak(u);
}
function vibrate(ms=120){
  if (!$('#opt-haptics').checked) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}
function saveLog(log){
  localStorage.setItem('stridemate_log', JSON.stringify(log));
}
function loadLog(){
  try { return JSON.parse(localStorage.getItem('stridemate_log')||'[]'); } catch(e){ return []; }
}

// RUN session state
let watchId = null;
let run = null; // {start, points:[{t,lat,lon}], splits:[{km,seconds}], paused, totalDist, elapsed}
let ticker = null;

function resetRun(){
  run = {
    start: Date.now(),
    points: [],
    splits: [],
    paused:false,
    totalDist:0,
    elapsed:0,
  };
  updateKpis();
  drawPath();
  updateSplitsTable();
  drawPaceChart();
}
function updateKpis(){
  $('#kpi-time').textContent = fmtTime(run?.elapsed||0);
  $('#kpi-distance').textContent = (km(run?.totalDist||0)).toFixed(2) + ' km';
  const pace = (run?.totalDist>0) ? (run.elapsed / km(run.totalDist)) : 0;
  $('#kpi-pace').textContent = pace ? `${fmt2(Math.floor(pace/60))}:${fmt2(Math.floor(pace%60))} /km` : '—';
  $('#kpi-splits').textContent = run?.splits?.length || 0;
}

function drawPath(){
  const c = $('#mapCanvas');
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle = '#0b0b0e';
  ctx.fillRect(0,0,c.width,c.height);
  if (!run || run.points.length<2) return;
  // normalize
  const lats = run.points.map(p=>p.lat), lons = run.points.map(p=>p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const pad = 20;
  const w = c.width - pad*2, h = c.height - pad*2;
  ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 3; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath();
  run.points.forEach((p,i)=>{
    const x = pad + ( (p.lon - minLon) / Math.max(1e-9,(maxLon-minLon)) ) * w;
    const y = pad + h - ( (p.lat - minLat) / Math.max(1e-9,(maxLat-minLat)) ) * h;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  // start/end
  const first = run.points[0], last = run.points[run.points.length-1];
  const x1 = pad + ((first.lon-minLon)/Math.max(1e-9,(maxLon-minLon)))*w;
  const y1 = pad + h - ((first.lat-minLat)/Math.max(1e-9,(maxLat-minLat)))*h;
  const x2 = pad + ((last.lon-minLon)/Math.max(1e-9,(maxLon-minLon)))*w;
  const y2 = pad + h - ((last.lat-minLat)/Math.max(1e-9,(maxLat-minLat)))*h;
  ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(x1,y1,6,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(x2,y2,6,0,Math.PI*2); ctx.fill();
}

function drawPaceChart(){
  const c = $('#paceChart'); const ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle = '#0b0b0e'; ctx.fillRect(0,0,c.width,c.height);
  const paces = run?.splits?.map(s=>s.seconds) || [];
  if (!paces.length) return;
  const max = Math.max(...paces), min = Math.min(...paces);
  const pad = 30, w = c.width - pad*2, h = c.height - pad*2;
  ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2; ctx.beginPath();
  paces.forEach((sec,i)=>{
    const x = pad + (i/(paces.length-1)) * w;
    const y = pad + (1 - (sec-min)/(max-min||1)) * h;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  // axis labels (simple)
  ctx.fillStyle = '#a1a1aa'; ctx.font = '12px system-ui';
  ctx.fillText(fmtTime(min), 4, c.height-6);
  ctx.fillText(fmtTime(max), 4, 16);
}

function addPoint(lat, lon, t){
  const pts = run.points;
  const last = pts[pts.length-1];
  pts.push({lat, lon, t});
  if (last){
    const d = distance(last.lat, last.lon, lat, lon);
    run.totalDist += d;
    // handle splits each whole km
    const kmDone = Math.floor(km(run.totalDist));
    if (kmDone > run.splits.length){
      const elapsedAtSplit = run.elapsed;
      const lastKmTime = run.splits.length? elapsedAtSplit - run.splits.reduce((a,s)=>a+s.seconds,0) : elapsedAtSplit;
      run.splits.push({km: kmDone, seconds: Math.round(lastKmTime)});
      updateSplitsTable();
      drawPaceChart();
      speak(`Kilometer ${kmDone} in ${fmtTime(lastKmTime)}`);
      vibrate([80,50,80]);
    }
  }
  drawPath();
  updateKpis();
}

function updateSplitsTable(){
  const tb = $('#splits-table tbody'); tb.innerHTML='';
  run.splits.forEach(s=>{
    const tr = document.createElement('tr');
    const pace = `${fmt2(Math.floor(s.seconds/60))}:${fmt2(s.seconds%60)}`;
    tr.innerHTML = `<td>${s.km}</td><td>${pace}/km</td>`;
    tb.appendChild(tr);
  });
}

// Geolocation handling
function startWatch(){
  if (!navigator.geolocation){ alert('Geolocation not supported. Try Demo.'); return; }
  watchId = navigator.geolocation.watchPosition(pos => {
    if (!run || run.paused) return;
    const {latitude, longitude} = pos.coords;
    addPoint(latitude, longitude, Date.now());
  }, err => {
    console.warn(err);
  }, { enableHighAccuracy:true, maximumAge:1000, timeout:10000 });
}

function startTicker(){
  ticker = setInterval(()=>{
    if (!run || run.paused) return;
    run.elapsed = Math.round((Date.now() - run.start)/1000);
    updateKpis();
  }, 1000);
}

function startRun(){
  resetRun();
  speak('Run started');
  startWatch();
  startTicker();
}
function pauseRun(){
  if (!run) return;
  run.paused = !run.paused;
  speak(run.paused?'Paused':'Resumed');
}
function stopRun(save=true){
  if (!run) return;
  if (watchId) { navigator.geolocation.clearWatch(watchId); watchId=null; }
  if (ticker) { clearInterval(ticker); ticker=null; }
  // finalize last split if partial km? keep as is; splits only at whole km
  if (save){
    const log = loadLog();
    log.unshift({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      title: 'Outdoor Run',
      distance_km: parseFloat(km(run.totalDist).toFixed(2)),
      duration_s: run.elapsed,
      splits: run.splits,
      points: run.points,
    });
    saveLog(log);
    renderLog();
    speak('Run saved');
  }
  run=null;
  updateKpis();
  drawPath();
  drawPaceChart();
  updateSplitsTable();
}

// Demo run generator (circle-ish path)
function demoRun(){
  resetRun();
  const center = {lat: 45.4642, lon: 9.19};
  let angle = 0; const radius = 0.005; // degrees ~ 500m
  let t = Date.now();
  const demo = setInterval(()=>{
    if (!run) { clearInterval(demo); return; }
    if (run.elapsed>1800) { clearInterval(demo); stopRun(true); return; } // 30 min cap
    const lat = center.lat + radius*Math.cos(angle);
    const lon = center.lon + radius*Math.sin(angle);
    addPoint(lat, lon, t);
    if (!ticker) startTicker();
    run.elapsed += 5; // simulate 5s steps
    angle += 0.02 + (Math.random()*0.01);
  }, 50);
}

// Buttons
$('#btn-start').addEventListener('click', startRun);
$('#btn-pause').addEventListener('click', pauseRun);
$('#btn-stop').addEventListener('click', ()=>stopRun(true));
$('#btn-demo').addEventListener('click', demoRun);

// Export GPX
function exportGPX(){
  if (!run || !run.points.length){ alert('No active run data.'); return; }
  const pts = run.points.map(p=>`<trkpt lat="${p.lat}" lon="${p.lon}"><time>${new Date(p.t||Date.now()).toISOString()}</time></trkpt>`).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="StrideMate" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>StrideMate Run</name><trkseg>
    ${pts}
  </trkseg></trk>
</gpx>`;
  const blob = new Blob([gpx], {type:'application/gpx+xml'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stridemate-run.gpx'; a.click();
}
$('#btn-export-gpx').addEventListener('click', exportGPX);

// Import GPX (basic)
$('#gpx-import').addEventListener('change', e=>{
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    const xml = new DOMParser().parseFromString(reader.result, 'text/xml');
    const trkpts = Array.from(xml.getElementsByTagName('trkpt'));
    resetRun();
    trkpts.forEach((pt,i)=>{
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      addPoint(lat, lon, Date.now()+i*1000);
      run.elapsed = i; // fake
    });
    stopRun(true);
  };
  reader.readAsText(file);
});

// Log management
function renderLog(){
  const tb = $('#log-table tbody');
  const log = loadLog();
  tb.innerHTML = '';
  log.forEach(entry=>{
    const tr = document.createElement('tr');
    const pace = `${fmt2(Math.floor(entry.duration_s/60 / entry.distance_km))}:${fmt2(Math.floor((entry.duration_s/ entry.distance_km)%60))}`;
    tr.innerHTML = `<td>${new Date(entry.date).toLocaleString()}</td>
      <td contenteditable="true" data-id="${entry.id}" class="title">${entry.title}</td>
      <td>${entry.distance_km.toFixed(2)} km</td>
      <td>${fmtTime(entry.duration_s)}</td>
      <td>${pace}/km</td>
      <td>
        <button data-id="${entry.id}" class="btn secondary view">View</button>
        <button data-id="${entry.id}" class="btn danger del">Delete</button>
      </td>`;
    tb.appendChild(tr);
  });
  // actions
  tb.querySelectorAll('button.view').forEach(b=>b.addEventListener('click', ()=>viewEntry(b.dataset.id)));
  tb.querySelectorAll('button.del').forEach(b=>b.addEventListener('click', ()=>delEntry(b.dataset.id)));
  tb.querySelectorAll('td.title').forEach(td=>{
    td.addEventListener('blur', ()=>{
      const id = td.dataset.id; const log = loadLog();
      const e = log.find(x=>x.id===id); if (e){ e.title = td.textContent.trim(); saveLog(log); }
    });
  });
}
function viewEntry(id){
  const log = loadLog();
  const e = log.find(x=>x.id===id); if (!e) return;
  // populate run visuals from saved entry (readonly)
  resetRun();
  run.points = e.points || [];
  run.splits = e.splits || [];
  run.totalDist = (e.distance_km||0)*1000;
  run.elapsed = e.duration_s||0;
  drawPath(); updateKpis(); updateSplitsTable(); drawPaceChart();
  // switch to Run tab to show
  $$('.tabs button').forEach(x=>x.classList.remove('active'));
  $$('.screen').forEach(sc => sc.classList.remove('active'));
  $('[data-target="run"]').classList.add('active');
  $('#screen-run').classList.add('active');
}
function delEntry(id){
  const log = loadLog().filter(x=>x.id!==id);
  saveLog(log); renderLog();
}

// Export/Import JSON
$('#btn-export-json').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(loadLog(),null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stridemate-log.json'; a.click();
});
$('#json-import').addEventListener('change', e=>{
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data)){ saveLog(data); renderLog(); alert('Log imported'); }
      else alert('Invalid log file');
    } catch(err){ alert('Invalid JSON'); }
  };
  reader.readAsText(file);
});
$('#btn-new-manual').addEventListener('click', ()=>{
  const dist = parseFloat(prompt('Distance (km):','5'));
  const time = parseMMSS(prompt('Time (mm:ss):','25:00'));
  if (!isFinite(dist)||!isFinite(time)) return;
  const log = loadLog();
  log.unshift({ id: crypto.randomUUID(), date:new Date().toISOString(), title:'Manual Run', distance_km:dist, duration_s:time, splits:[], points:[] });
  saveLog(log); renderLog();
});
$('#btn-clear-log').addEventListener('click', ()=>{
  if (confirm('Delete ALL runs?')){ saveLog([]); renderLog(); }
});

// Tools: Pace calc
$('#btn-calc-pace').addEventListener('click', ()=>{
  const d = parseFloat($('#pc-dist').value); const s = parseMMSS($('#pc-time').value);
  if (!isFinite(d) || !isFinite(s) || d<=0) { $('#pc-result').textContent='—'; return; }
  const pace = s/d; $('#pc-result').textContent = `${fmt2(Math.floor(pace/60))}:${fmt2(Math.floor(pace%60))} /km`;
});

// Tools: Riegel predictor
$('#btn-predict').addEventListener('click', ()=>{
  const d1 = parseFloat($('#rp-d1').value);
  const t1 = parseMMSS($('#rp-t1').value);
  const d2 = parseFloat($('#rp-d2').value);
  if (![d1,t1,d2].every(isFinite) || d1<=0 || d2<=0) { $('#rp-result').textContent='—'; return; }
  const t2 = t1 * (d2/d1)**1.06; // Riegel exponent ~1.06
  $('#rp-result').textContent = fmtTime(Math.round(t2));
});

// Intervals
let ivTimer = null, ivQueue = [];
function startIntervals(){
  const warm = parseInt($('#iv-warmup').value,10)*60;
  const work = parseInt($('#iv-work').value,10)*60;
  const rest = parseInt($('#iv-rest').value,10)*60;
  const reps = parseInt($('#iv-reps').value,10);
  const cool = parseInt($('#iv-cool').value,10)*60;
  ivQueue = [];
  if (warm>0) ivQueue.push(['Warmup', warm]);
  for (let i=1;i<=reps;i++){ ivQueue.push([`Work ${i}/${reps}`, work]); if (rest>0 && i<reps) ivQueue.push([`Rest ${i}/${reps}`, rest]); }
  if (cool>0) ivQueue.push(['Cooldown', cool]);
  nextIv();
}
function nextIv(){
  if (ivTimer) clearInterval(ivTimer);
  if (!ivQueue.length){ $('#iv-status').textContent='Done'; $('#iv-left').textContent='0'; speak('Intervals completed'); vibrate([60,40,60,40,120]); return; }
  const [label, secs] = ivQueue.shift();
  let left = secs;
  $('#iv-status').textContent = label;
  $('#iv-left').textContent = fmtTime(left);
  speak(label);
  ivTimer = setInterval(()=>{
    left--; $('#iv-left').textContent = fmtTime(left);
    if (left<=0){ clearInterval(ivTimer); vibrate(); speak('Switch'); nextIv(); }
  }, 1000);
}
$('#btn-intervals-start').addEventListener('click', startIntervals);
$('#btn-intervals-stop').addEventListener('click', ()=>{ if (ivTimer) clearInterval(ivTimer); $('#iv-status').textContent='Stopped'; });

// Training plan
$('#btn-plan').addEventListener('click', ()=>{
  const weeks = parseInt($('#tp-weeks').value,10);
  const weekly = parseFloat($('#tp-weekly').value);
  if (!isFinite(weeks)||!isFinite(weekly)||weeks<1){ $('#tp-output').textContent='—'; return; }
  const base = weekly * 0.7;
  let html = '<ol>';
  for (let w=1; w<=weeks; w++){
    const mult = 0.7 + (0.3*(w-1)/(weeks-1||1));
    const target = Math.round((weekly*mult)*10)/10;
    html += `<li>Week ${w}: ${target} km — 4 runs (e.g., ${Math.round(target*0.4)} easy, ${Math.round(target*0.25)} quality, ${Math.round(target*0.2)} long, ${Math.round(target*0.15)} recovery)</li>`;
  }
  html += '</ol>';
  $('#tp-output').innerHTML = html;
});

// Settings persistence
['opt-voice','opt-haptics','opt-autopause'].forEach(id=>{
  const key = 'stridemate_'+id;
  const el = $('#'+id);
  const v = localStorage.getItem(key); if (v!==null) el.checked = v==='true';
  el.addEventListener('change', ()=>localStorage.setItem(key, el.checked));
});
window.addEventListener('blur', ()=>{ if ($('#opt-autopause').checked && run && !run.paused) pauseRun(); });

// Initial render
renderLog();
updateKpis();
drawPath();
drawPaceChart();
updateSplitsTable();
