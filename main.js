/* ══════════════════════════════════════════════════════════════════
   OPEN CALL — main.js
   Fetches listings from data.json (or the Cloudflare Worker if
   WORKER_URL is set) then initialises the site.
   ══════════════════════════════════════════════════════════════════ */

// ── DATA SOURCE ────────────────────────────────────────────────────────────
// If you've deployed the Cloudflare Worker, replace null below with your
// worker URL, e.g.: 'https://opencall-worker.your-name.workers.dev/data.json'
// While null, the site falls back to the local data.json file.
const WORKER_URL = 'https://opencall-worker.opencall2026.workers.dev/data.json';

// Try the worker first; if it's unavailable or returns non-array data, fall
// back to the bundled data.json so the site always has listings to display.
async function loadListings() {
  if (WORKER_URL) {
    try {
      const r = await fetch(WORKER_URL);
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (e) {
      console.warn('Worker unavailable, falling back to data.json:', e);
    }
  }
  const r = await fetch('data.json');
  return r.json();
}

loadListings()
  .then(data => init(data))
  .catch(err => {
    console.error('Failed to load listings:', err);
    document.getElementById('grid').innerHTML =
      '<div class="empty-state">Could not load listings. Please refresh.</div>';
  });

function init(opportunities) {

/* ── AUTO-EXPIRY: mark past deadlines ────────────────────────────
   Compare each listing's deadline to today. Expired listings get
   an `expired` flag so renderGrid() can sort them to the bottom
   and visually grey them out — no manual updates needed.
   ────────────────────────────────────────────────────────────── */
const today = new Date();
today.setHours(0, 0, 0, 0);
opportunities.forEach(o => {
  if (o.deadline && o.deadline !== 'rolling' && o.deadline !== 'ongoing') {
    const d = new Date(o.deadline + 'T00:00:00');
    o.expired = d < today;
    o.daysLeft = Math.ceil((d - today) / 86400000);
  } else {
    o.expired = false;
    o.daysLeft = 9999;
  }
});


/* ── STATE ── */
let activeTab = 'all';
let activeRegion = 'all';
let activeMedium = 'all';
let activeEligibility = 'all';
let sortMode = 'deadline';
let searchQuery = '';
let hideFees = false;
let savedIds = new Set();

// Load saved from localStorage safely
try { savedIds = new Set(JSON.parse(localStorage.getItem('opencall_saved') || '[]')); } catch(e) {}

/* ── TAB SWITCHING ── */


/* ── STATS DASHBOARD ── */
function renderStats() {
  const opps = allOpps();
  const el = document.getElementById('statsContent');
  if (!el) return;

  const byType = {};
  const byRegion = {};
  const byMonth = {};
  let totalValue = 0, noFeeCount = 0, rollingCount = 0;
  const now = new Date();

  opps.forEach(o => {
    byType[o.type] = (byType[o.type]||0) + 1;
    byRegion[o.region] = (byRegion[o.region]||0) + 1;
    if (!o.fee) noFeeCount++;
    if (isRolling(o)) { rollingCount++; return; }
    const d = new Date(o.deadline);
    if (d >= now) {
      const key = d.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
      byMonth[key] = (byMonth[key]||0) + 1;
    }
    const nums = (o.amount||'').match(/[\d,]+/g);
    if (nums) totalValue += Math.max(...nums.map(n=>parseInt(n.replace(/,/g,''))));
  });

  const typeColors = {grant:'var(--rust)',exhibition:'var(--gold)',residency:'var(--green)',prize:'var(--indigo)',fellowship:'#7a5a3a',emergency:'#8a3a3a'};
  const typeLabels = {grant:'Grants',exhibition:'Exhibitions',residency:'Residencies',prize:'Prizes',fellowship:'Fellowships',emergency:'Emergency Funds'};
  const regionLabels = {'north-america':'North America',europe:'Europe',asia:'Asia / Pacific','latin-america':'Latin America','middle-east':'Middle East & Africa',all:'International'};

  const total = opps.length;
  const active = opps.filter(o => !isClosed(o) && !isRolling(o)).length + rollingCount;

  function bar(val, max, color) {
    const pct = Math.round((val/max)*100);
    return `<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.4rem">
      <div style="width:160px;font-family:DM Mono,monospace;font-size:0.65rem;letter-spacing:0.05em;color:var(--muted);text-transform:uppercase;flex-shrink:0">${this}</div>
      <div style="flex:1;background:var(--divider);height:6px;border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;background:${color};height:100%;border-radius:3px;transition:width 0.6s ease"></div>
      </div>
      <div style="font-family:DM Mono,monospace;font-size:0.65rem;color:var(--muted);width:32px;text-align:right">${val}</div>
    </div>`;
  }

  const typeMax = Math.max(...Object.values(byType));
  const regionMax = Math.max(...Object.values(byRegion));

  const sectionStyle = 'margin-bottom:4rem';
  const labelStyle = "font-family:DM Mono,monospace;font-size:0.62rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--rust);margin-bottom:2.5rem;padding-bottom:1rem;border-bottom:1px solid var(--divider)";
  const bigNumStyle = "font-family:'Cormorant Garamond',serif;font-size:3.5rem;font-weight:300;line-height:1;color:var(--ink)";
  const bigLabelStyle = "font-family:DM Mono,monospace;font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-top:0.3rem";

  el.innerHTML = `
    <style>
      .stat-section { margin-bottom: 4rem; }
      .stat-section-label { font-family: 'DM Mono', monospace; font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink); font-weight: 700; padding-bottom: 1rem; border-bottom: 1px solid var(--divider); margin-bottom: 2.5rem; }
      .stat-row { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1rem; }
      .stat-row-label { width: 160px; font-family: 'DM Mono', monospace; font-size: 0.65rem; letter-spacing: 0.05em; color: var(--muted); text-transform: uppercase; flex-shrink: 0; }
      .stat-row-track { flex: 1; background: var(--divider); height: 6px; border-radius: 3px; overflow: hidden; }
      .stat-row-fill { height: 100%; border-radius: 3px; }
      .stat-row-count { font-family: 'DM Mono', monospace; font-size: 0.65rem; color: var(--muted); width: 32px; text-align: right; flex-shrink: 0; }
      .stat-big-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 2rem; margin-bottom: 4rem; padding-bottom: 3rem; border-bottom: 1px solid var(--divider); }
      .stat-big-num { font-family: 'DM Mono', monospace; font-size: 3.5rem; font-weight: 300; line-height: 1; color: var(--ink); }
      .stat-big-label { font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-top: 0.4rem; }
    </style>

    <div class="stat-big-grid">
      <div><div class="stat-big-num">${total}</div><div class="stat-big-label">Total listings</div></div>
      <div><div class="stat-big-num">${active}</div><div class="stat-big-label">Open now</div></div>
      <div><div class="stat-big-num">${noFeeCount}</div><div class="stat-big-label">No application fee</div></div>
      <div><div class="stat-big-num">${rollingCount}</div><div class="stat-big-label">Rolling deadline</div></div>
    </div>

    <div class="stat-section">
      <div class="stat-section-label">By type</div>
      ${Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([type,count]) => `
        <div class="stat-row">
          <div class="stat-row-label">${typeLabels[type]||type}</div>
          <div class="stat-row-track"><div class="stat-row-fill" style="width:${Math.round((count/typeMax)*100)}%;background:${typeColors[type]||'var(--rust)'}"></div></div>
          <div class="stat-row-count">${count}</div>
        </div>`).join('')}
    </div>

    <div class="stat-section">
      <div class="stat-section-label">By region</div>
      ${Object.entries(byRegion).sort((a,b)=>b[1]-a[1]).map(([region,count]) => `
        <div class="stat-row">
          <div class="stat-row-label">${regionLabels[region]||region}</div>
          <div class="stat-row-track"><div class="stat-row-fill" style="width:${Math.round((count/regionMax)*100)}%;background:var(--rust)"></div></div>
          <div class="stat-row-count">${count}</div>
        </div>`).join('')}
    </div>

    <div class="stat-section">
      <div class="stat-section-label">Upcoming deadlines by month</div>
      ${Object.entries(byMonth).slice(0,8).map(([month,count]) => `
        <div class="stat-row">
          <div class="stat-row-label">${month}</div>
          <div class="stat-row-track"><div class="stat-row-fill" style="width:${Math.round((count/Math.max(...Object.values(byMonth)))*100)}%;background:var(--green)"></div></div>
          <div class="stat-row-count">${count}</div>
        </div>`).join('')}
    </div>
  `;
}

/* ── SIMILAR OPPORTUNITIES ── */
function getSimilar(o, n=3) {
  return allOpps()
    .filter(x => x.id !== o.id && !isClosed(x) && !isRolling(x))
    .map(x => {
      let score = 0;
      if (x.type === o.type) score += 3;
      if (x.region === o.region) score += 2;
      const shared = x.discipline.filter(d => o.discipline.includes(d)).length;
      score += shared;
      return { x, score };
    })
    .filter(({score}) => score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, n)
    .map(({x}) => x);
}


function updateExportBar() {
  const bar = document.getElementById('exportBar');
  const count = document.getElementById('exportCount');
  const n = savedIds.size;
  if (n > 0) {
    bar.classList.add('visible');
    count.textContent = n + ' saved opportunit' + (n === 1 ? 'y' : 'ies');
  } else {
    bar.classList.remove('visible');
  }
}

function exportSavedText() {
  const list = allOpps().filter(o => savedIds.has(o.id));
  if (!list.length) return;
  const lines = list.map(o => {
    const deadline = isRolling(o) ? 'Rolling' : new Date(o.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
    return [
      o.title,
      o.org,
      'Type: ' + o.type.charAt(0).toUpperCase() + o.type.slice(1),
      'Deadline: ' + deadline,
      'Award: ' + (o.amount || 'See website'),
      'Location: ' + o.location,
      o.url,
      '─'.repeat(48)
    ].join('\n');
  });
  const text = 'SAVED OPPORTUNITIES — Open Call\n' + '═'.repeat(48) + '\n\n' + lines.join('\n\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  }).catch(() => {
    const w = window.open('', '_blank');
    w.document.write('<pre style="font-family:monospace;padding:2rem">' + text.replace(/</g,'&lt;') + '</pre>');
  });
}

function exportSavedCSV() {
  const list = allOpps().filter(o => savedIds.has(o.id));
  if (!list.length) return;
  const header = ['Title','Organisation','Type','Deadline','Award','Location','Region','Fee','URL'];
  const rows = list.map(o => {
    const deadline = isRolling(o) ? 'Rolling' : o.deadline;
    return [o.title, o.org, o.type, deadline, o.amount||'', o.location, o.region, o.fee?'Yes':'No', o.url]
      .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'opencall-saved.csv';
  a.click();
}


/* ── CALENDAR ── */
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

const calTypeColors = {
  grant: 'var(--rust)',
  exhibition: 'var(--gold)',
  residency: 'var(--green)',
  prize: 'var(--indigo)',
  fellowship: '#7a5a3a',
  emergency: '#8a3a3a'
};

function renderCalendar() {
  const label = document.getElementById('calMonthLabel');
  const grid = document.getElementById('calGrid');
  const legend = document.getElementById('calLegend');
  if (!label || !grid) return;

  label.textContent = new Date(calYear, calMonth, 1).toLocaleDateString('en-GB', {month:'long', year:'numeric'});

  // Build deadline map: 'YYYY-MM-DD' -> [opp, ...]
  const map = {};
  allOpps().forEach(o => {
    if (isRolling(o) || isClosed(o)) return;
    const d = o.deadline.slice(0,10);
    const [y,m] = d.split('-').map(Number);
    if (y === calYear && m - 1 === calMonth) {
      if (!map[d]) map[d] = [];
      map[d].push(o);
    }
  });

  // Legend
  const typesInMonth = new Set(Object.values(map).flat().map(o => o.type));
  const typeLabels = {grant:'Grants',exhibition:'Exhibitions',residency:'Residencies',prize:'Prizes',fellowship:'Fellowships',emergency:'Emergency'};
  legend.innerHTML = [...typesInMonth].map(t =>
    `<div class="cal-legend-item"><div class="cal-legend-dot" style="background:${calTypeColors[t]}"></div>${typeLabels[t]||t}</div>`
  ).join('') || '<div class="cal-legend-item" style="font-style:italic">No deadlines this month</div>';

  // Day headers
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let html = days.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // First day of month (adjust so week starts Monday)
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const startOffset = (firstDay === 0 ? 6 : firstDay - 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === calYear && today.getMonth() === calMonth;

  // Fill grid
  let dayCount = 1;
  let nextCount = 1;
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    let day, dateStr, isOther = false;
    if (i < startOffset) {
      day = daysInPrevMonth - startOffset + i + 1;
      const pm = calMonth === 0 ? 12 : calMonth;
      const py = calMonth === 0 ? calYear - 1 : calYear;
      dateStr = `${py}-${String(pm).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      isOther = true;
    } else if (dayCount <= daysInMonth) {
      day = dayCount++;
      dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    } else {
      day = nextCount++;
      const nm = calMonth === 11 ? 1 : calMonth + 2;
      const ny = calMonth === 11 ? calYear + 1 : calYear;
      dateStr = `${ny}-${String(nm).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      isOther = true;
    }

    const isToday = isCurrentMonth && !isOther && day === today.getDate();
    const opps = map[dateStr] || [];
    const show = opps.slice(0, 3);
    const more = opps.length - show.length;

    html += `<div class="cal-cell${isOther ? ' other-month' : ''}${isToday ? ' today' : ''}">
      <div class="cal-date">${day}</div>
      ${show.map(o => `<div class="cal-dot" onclick="openModal(${o.id})" title="${o.title}">
        <div class="cal-dot-circle" style="background:${calTypeColors[o.type]}"></div>
        <div class="cal-dot-title">${o.title}</div>
      </div>`).join('')}
      ${more > 0 ? `<div class="cal-more" onclick="calShowAll('${dateStr}')">+${more} more</div>` : ''}
    </div>`;
  }

  grid.innerHTML = html;
}

function calPrev() {
  if (calMonth === 0) { calMonth = 11; calYear--; } else { calMonth--; }
  renderCalendar();
}

function calNext() {
  if (calMonth === 11) { calMonth = 0; calYear++; } else { calMonth++; }
  renderCalendar();
}

function calGoToday() {
  calYear = new Date().getFullYear();
  calMonth = new Date().getMonth();
  renderCalendar();
}

function calShowAll(dateStr) {
  const opps = allOpps().filter(o => !isRolling(o) && o.deadline.slice(0,10) === dateStr);
  if (opps.length === 1) { openModal(opps[0].id); return; }
  // Open first one — future enhancement could show a mini list
  openModal(opps[0].id);
}


/* ── DRAG-SCROLL FOR ALL FILTER BARS ── */
function initFilterDragScroll() {
  document.querySelectorAll('.filters, .filters-medium, .closing-soon-list').forEach(el => {
    let isDown = false, startX, scrollLeft;
    el.addEventListener('mousedown', e => {
      // Don't interfere with button clicks
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
      isDown = true;
      el.classList.add('grabbing');
      startX = e.pageX - el.getBoundingClientRect().left;
      scrollLeft = el.scrollLeft;
      e.preventDefault();
    });
    el.addEventListener('mouseleave', () => { isDown = false; el.classList.remove('grabbing'); });
    el.addEventListener('mouseup', () => { isDown = false; el.classList.remove('grabbing'); });
    el.addEventListener('mousemove', e => {
      if (!isDown) return;
      const x = e.pageX - el.getBoundingClientRect().left;
      el.scrollLeft = scrollLeft - (x - startX);
    });
    // Touch support
    let touchStartX, touchScrollLeft;
    el.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].pageX;
      touchScrollLeft = el.scrollLeft;
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      const dx = touchStartX - e.touches[0].pageX;
      el.scrollLeft = touchScrollLeft + dx;
    }, { passive: true });
  });
}

function toggleDark() {
  const dark = document.body.classList.toggle('dark');
  document.getElementById('darkBtn').innerHTML = dark ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  try { localStorage.setItem('opencall_dark', dark ? '1' : '0'); } catch(e) {}
}
// Restore dark mode preference
try { if (localStorage.getItem('opencall_dark') === '1') { document.body.classList.add('dark'); document.getElementById('darkBtn').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>`; } } catch(e) {}

function goHome() {
  // Reset search
  const si = document.getElementById('searchInput');
  if (si) si.value = '';
  searchQuery = '';
  // Reset sort
  sortMode = 'deadline';
  const sd = document.getElementById('sortSelect');
  if (sd) sd.value = 'deadline';
  // Reset region/medium filters
  const rf = document.getElementById('regionFilter');
  if (rf) rf.value = 'all';
  const mf = document.getElementById('mediumFilter');
  if (mf) mf.value = 'all';
  activeRegion = 'all';
  activeMedium = 'all';
  activeEligibility = 'all';
  switchTab('all');
}

function switchTab(tab) {
  activeTab = tab;

  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  const el = document.getElementById('tab-' + tab);
  if (el) el.classList.add('active');

  document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.classList.remove('animating'); });

  if (['all','grant','exhibition','residency','prize','fellowship','emergency'].includes(tab)) {
    const pl = document.getElementById('page-listing'); pl.classList.add('active'); requestAnimationFrame(() => pl.classList.add('animating'));
    updateHero(tab);
    renderGrid();
  } else {
    const pg = document.getElementById('page-' + tab);
    if (pg) { pg.classList.add('active'); requestAnimationFrame(() => pg.classList.add('animating')); }
    if (tab === 'saved') renderSaved();
    if (tab === 'stats') renderStats();
    if (tab === 'calendar') renderCalendar();
  }

  window.scrollTo({top:0,behavior:'smooth'});
}

const heroConfigs = {
  all:        {tag:'International Art Opportunities', title:'Find your next<br><em>grant, exhibition,</em><br>or residency', sub:'A curated, continuously updated index of art grants, open calls, exhibition opportunities, and artist residencies from around the world.'},
  grant:      {tag:'Funding Opportunities', title:'Art <em>Grants</em><br>& Funding', sub:'Unrestricted grants, project awards, and financial support for visual artists and collectives across all career stages.'},
  exhibition: {tag:'Open Calls & Exhibitions', title:'Exhibition<br><em>Open Calls</em>', sub:'Open calls for group exhibitions, biennales, art fairs, gallery shows, and commissions — from major institutions and independent spaces worldwide.'},
  residency:  {tag:'Artist Residencies', title:'Studio<br><em>Residencies</em>', sub:'Live and work residencies ranging from intensive summer programmes to year-long fellowships, in cities, rural retreats, and institutions worldwide.'},
  prize:      {tag:'Awards & Prizes', title:'Art <em>Prizes</em><br>& Awards', sub:'Career-defining prizes, juried awards, and recognition programmes celebrating achievement in contemporary visual art and photography.'},
  fellowship: {tag:'Fellowships & Supported Programmes', title:'Artist<br><em>Fellowships</em>', sub:'Fully funded fellowships offering stipends, studio time, mentorship, and institutional support — from emerging artist programmes to prestigious career-stage awards.'},
  emergency:  {tag:'Emergency & Crisis Support', title:'Emergency<br><em>funds</em>', sub:'Rapid-response grants and relief funds for artists facing sudden financial hardship, medical crises, natural disasters, or unexpected career disruptions.'},
};

function updateHero(tab) {
  const c = heroConfigs[tab];
  document.getElementById('listing-tag').textContent = c.tag;
  document.getElementById('listing-title').innerHTML = c.title;
  document.getElementById('listing-sub').textContent = c.sub;
}

/* ── HELPERS ── */
function allOpps() { return [...opportunities]; }

function getDaysUntil(d) { return Math.ceil((new Date(d) - new Date()) / 86400000); }

function fmtDeadline(d) {
  if (d.startsWith('2099')) return {text:'Rolling — apply anytime',urgent:false};
  const days = getDaysUntil(d);
  const fmt = new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  if (days < 0) return {text:'Closed',urgent:false};
  if (days === 0) return {text:'Due today!',urgent:true};
  if (days <= 14) return {text:`${fmt} · ${days}d left`,urgent:true};
  return {text:fmt,urgent:false};
}

function countType(type) { return allOpps().filter(o => type==='all' || o.type===type).length; }

function updateBadges() {
  ['all','grant','exhibition','residency','prize','fellowship','emergency'].forEach(t => {
    const b = document.getElementById('badge-'+t);
    if (b) b.textContent = countType(t);
    const s = document.getElementById('stat-'+t);
    if (s) s.textContent = countType(t);
  });
  const bs = document.getElementById('badge-saved');
  if (bs) bs.textContent = savedIds.size;
  // Refresh footer save buttons on visible cards
  document.querySelectorAll('[id^="sfb-"]').forEach(btn => {
    const id = parseInt(btn.id.replace('sfb-',''));
    const saved = savedIds.has(id);
    btn.textContent = saved ? '★ Saved' : '☆ Save';
    btn.classList.toggle('saved', saved);
  });
}

/* ── GRID ── */
const isRolling = o => o.deadline.startsWith('2099');
const isClosed = o => !isRolling(o) && new Date(o.deadline) < new Date();

function filtered() {
  let list = allOpps().filter(o => {
    const mt = activeTab==='all' || o.type===activeTab;
    const mr = activeRegion==='all' || o.region===activeRegion;
    const mm = activeMedium==='all' || o.discipline.some(d => d.toLowerCase().includes(activeMedium));
    const me = activeEligibility==='all' || (o.eligibilityTags && o.eligibilityTags.includes(activeEligibility));
    const mf = !hideFees || !o.fee;
    const q = searchQuery;
    const ms = !q ||
      o.title.toLowerCase().includes(q) ||
      o.org.toLowerCase().includes(q) ||
      o.location.toLowerCase().includes(q) ||
      o.discipline.join(' ').toLowerCase().includes(q) ||
      (o.description||'').toLowerCase().includes(q);
    return mt && mr && mm && mf && ms && me;
  });
  const now = new Date();

  function extractValue(o) {
    const s = o.amount || '';
    const nums = s.match(/[\d,]+/g);
    if (!nums) return 0;
    return Math.max(...nums.map(n => parseInt(n.replace(/,/g,''))));
  }

  if (sortMode==='newest') {
    list.sort((a,b) => {
      const ac = isClosed(a), bc = isClosed(b);
      if (ac !== bc) return ac ? 1 : -1;
      return b.id - a.id;
    });
  } else if (sortMode==='alpha') {
    list.sort((a,b) => {
      const ac = isClosed(a), bc = isClosed(b);
      if (ac !== bc) return ac ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
  } else if (sortMode==='value') {
    list.sort((a,b) => {
      const ac = isClosed(a), bc = isClosed(b);
      if (ac !== bc) return ac ? 1 : -1;
      return extractValue(b) - extractValue(a);
    });
  } else if (sortMode==='nofee') {
    list.sort((a,b) => {
      const ac = isClosed(a), bc = isClosed(b);
      if (ac !== bc) return ac ? 1 : -1;
      if (a.fee && !b.fee) return 1;
      if (!a.fee && b.fee) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });
  } else {
    list.sort((a,b) => {
      const ac = isClosed(a), bc = isClosed(b);
      if (ac !== bc) return ac ? 1 : -1;
      // Rolling deadlines sort after all dated ones
      const ar = isRolling(a), br = isRolling(b);
      if (ar !== br) return ar ? 1 : -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });
  }
  return list;
}


function cardHTML(o, closed=false) {
  const dl = fmtDeadline(o.deadline);
  const saved = savedIds.has(o.id);
  return `<div class="card${closed?' card-closed':''}" onclick="openModal(${o.id})">
    <div class="card-top">
      <div style="display:flex;align-items:center;gap:0.4rem">
        <span class="card-type type-${o.type}">${o.type}</span>
        ${o.fee ? '<span class="fee-badge">⚠ App. fee</span>' : ''}
      </div>
      <div class="card-actions">
        <span class="card-deadline ${dl.urgent?'urgent':''}">${dl.text}</span>
        <button class="bookmark-btn ${saved?'saved':''}" onclick="toggleSave(event,${o.id})" title="${saved?'Remove':'Save'}">${saved?'★':'☆'}</button>
      </div>
    </div>
    <div><div class="card-title">${o.title}${isNew(o)?'<span class="new-badge">New</span>':''}</div><div class="card-org">${o.org}</div></div>
    <div class="card-meta"><span>${o.location}</span>${o.discipline.slice(0,2).map(d=>`<span>${d}</span>`).join('')}</div>
    <div class="card-tags">${o.discipline.slice(0,4).map(d=>`<span class="tag tag-${o.type}">${d}</span>`).join('')}${o.eligibilityTags&&o.eligibilityTags.length?o.eligibilityTags.map(t=>`<span class="elig-tag tag-${o.type}">${t==='lgbtq'?'LGBTQ+':t==='bipoc'?'BIPOC':t.charAt(0).toUpperCase()+t.slice(1)}</span>`).join(''):''}</div>
    <div class="card-amount">Award / Fee: <strong>${o.amount}</strong></div>
    <div class="card-footer">
      <button class="save-footer-btn ${saved?'saved':''}" onclick="toggleSave(event,${o.id})" id="sfb-${o.id}">
        ${saved?'★ Saved':'☆ Save'}
      </button>
      <button class="share-btn" onclick="shareOpportunity(event,${o.id})" title="Share">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Share
      </button>
    </div>
  </div>`;
}

function renderGrid() {
  const list = filtered();
  const g = document.getElementById('grid');
  if (!list.length) {
    g.innerHTML = '<div class="empty-state">No opportunities match your current filters.</div>';
    return;
  }

  const now = new Date();
  const open = list.filter(o => new Date(o.deadline) >= now);
  const closed = list.filter(o => new Date(o.deadline) < now);

  let html = open.map(cardHTML).join('');

  if (closed.length) {
    html += `<div class="closed-divider">
      <span>Closed — ${closed.length} past deadline</span>
    </div>`;
    html += closed.map(o => cardHTML(o, true)).join('');
  }

  g.innerHTML = html;

  // Stagger card entrance animations
  g.querySelectorAll('.card').forEach((card, i) => {
    card.style.animationDelay = `${Math.min(i * 30, 300)}ms`;
  });
}

/* ── SAVED ── */
function toggleSave(e, id) {
  e.stopPropagation();
  savedIds.has(id) ? savedIds.delete(id) : savedIds.add(id);
  try { localStorage.setItem('opencall_saved', JSON.stringify([...savedIds])); } catch(e) {}
  updateBadges();
  initFilterDragScroll();
  if (activeTab === 'saved') updateExportBar();
  if (['all','grant','exhibition','residency','prize'].includes(activeTab)) renderGrid();
  else if (activeTab==='saved') renderSaved();
}

function renderSaved() {
  const g = document.getElementById('saved-grid');
  const e = document.getElementById('saved-empty');
  const list = allOpps().filter(o => savedIds.has(o.id));
  if (!list.length) { g.innerHTML=''; e.style.display='block'; }
  else { e.style.display='none'; g.innerHTML = list.map(cardHTML).join(''); }
  updateExportBar();
}

function toggleFeeFilter() {
  hideFees = !hideFees;
  const btn = document.getElementById('feeFilterBtn');
  btn.classList.toggle('active', hideFees);
  btn.textContent = hideFees ? '✓ No fees' : 'No fees';
  renderGrid();
}


function filterEligibility(btn, elig) {
  activeEligibility = elig;
  document.querySelectorAll('.elig-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
}

function filterMedium(btn, medium) {
  activeMedium = medium;
  document.querySelectorAll('.medium-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
}


function shareOpportunity(e, id) {
  e.stopPropagation();
  const o = allOpps().find(x=>x.id===id);
  if (!o) return;
  const deepLink = 'https://opencall.ca/#' + id;
  const deadline = isRolling(o) ? 'Rolling' : new Date(o.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  const shareText = `${o.title} — ${o.org}\nDeadline: ${deadline}\nAward: ${o.amount}\n${deepLink}`;

  // Remove any existing share popup
  const existing = document.getElementById('share-popup');
  if (existing) { existing.remove(); return; }

  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();

  const popup = document.createElement('div');
  popup.id = 'share-popup';
  popup.style.cssText = `position:fixed;z-index:9999;background:var(--paper);border:1px solid var(--divider);padding:1rem 1.1rem;box-shadow:0 4px 24px rgba(0,0,0,0.12);min-width:280px;font-family:'DM Mono',monospace;`;
  // Position above or below button
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow > 160) {
    popup.style.top = (rect.bottom + 8) + 'px';
  } else {
    popup.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  }
  popup.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';

  popup.innerHTML = `
    <div style="font-size:0.56rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);margin-bottom:0.6rem">Share this listing</div>
    <div style="display:flex;gap:0.5rem;margin-bottom:0.7rem">
      <input id="share-url-input" readonly value="${deepLink}" style="flex:1;font-family:'DM Mono',monospace;font-size:0.62rem;border:1px solid var(--divider);background:var(--cream);padding:0.4rem 0.6rem;color:var(--ink);outline:none;min-width:0">
      <button id="share-copy-btn" onclick="doShareCopy()" style="font-family:'DM Mono',monospace;font-size:0.58rem;letter-spacing:0.08em;text-transform:uppercase;border:1px solid var(--divider);background:transparent;padding:0.4rem 0.8rem;cursor:pointer;white-space:nowrap;color:var(--ink)">Copy</button>
    </div>
    <div style="display:flex;gap:0.5rem">
      <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(o.title + ' — ' + o.org)}&url=${encodeURIComponent(deepLink)}" target="_blank" rel="noopener" style="font-family:'DM Mono',monospace;font-size:0.56rem;letter-spacing:0.08em;text-transform:uppercase;border:1px solid var(--divider);padding:0.35rem 0.7rem;text-decoration:none;color:var(--muted);transition:color 0.15s">X / Twitter</a>
      <a href="mailto:?subject=${encodeURIComponent(o.title)}&body=${encodeURIComponent(shareText)}" style="font-family:'DM Mono',monospace;font-size:0.56rem;letter-spacing:0.08em;text-transform:uppercase;border:1px solid var(--divider);padding:0.35rem 0.7rem;text-decoration:none;color:var(--muted);transition:color 0.15s">Email</a>
    </div>
  `;

  document.body.appendChild(popup);

  // Store share text for copy
  popup._shareText = shareText;
  popup._deepLink = deepLink;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(ev) {
      if (!popup.contains(ev.target) && ev.target !== btn) {
        popup.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
}

function doShareCopy() {
  const popup = document.getElementById('share-popup');
  const input = document.getElementById('share-url-input');
  const copyBtn = document.getElementById('share-copy-btn');
  const text = popup ? popup._shareText : (input ? input.value : '');
  const tryClipboard = () => {
    try {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = '✓ Copied';
        copyBtn.style.color = 'var(--green)';
        setTimeout(() => popup && popup.remove(), 1200);
      }).catch(fallback);
    } catch(e) { fallback(); }
  };
  const fallback = () => {
    if (input) { input.select(); try { document.execCommand('copy'); copyBtn.textContent = '✓ Copied'; copyBtn.style.color = 'var(--green)'; setTimeout(() => popup && popup.remove(), 1200); } catch(e) {} }
  };
  if (navigator.clipboard && window.isSecureContext) { tryClipboard(); } else { fallback(); }
}

function fallbackCopy(text, flash) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    flash('✓ Copied', 'var(--green)');
  } catch(e) {
    flash('✗ Failed', 'var(--rust)');
  }
  document.body.removeChild(ta);
}

/* ── FILTERS ── */
function filterRegion(btn, region) {
  activeRegion = region;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
}

function sortBy(val) { sortMode=val; renderGrid(); }

function filterSearch() {
  searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
  renderGrid();
}

/* ── MODAL ── */
function openModal(id) {
  const o = allOpps().find(x=>x.id===id);
  if (!o) return;
  const dl = fmtDeadline(o.deadline);
  const saved = savedIds.has(id);
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-type"><span class="card-type type-${o.type}">${o.type}</span></div>
    <h2 class="modal-title">${o.title}</h2>
    <p class="modal-org">${o.org}</p>
    <p class="modal-desc">${o.description}</p>
    <div class="modal-details">
      <div class="modal-detail"><div class="detail-label">Deadline</div><div class="detail-val" style="${dl.urgent?'color:var(--rust)':''}">${dl.text}</div></div>
      <div class="modal-detail"><div class="detail-label">Location</div><div class="detail-val">${o.location}</div></div>
      <div class="modal-detail"><div class="detail-label">Award / Support</div><div class="detail-val">${o.amount}</div></div>
      <div class="modal-detail"><div class="detail-label">Eligibility</div><div class="detail-val" style="font-size:0.86rem">${o.eligibility}</div></div>
    </div>
    ${o.fee ? '<div class="fee-warning">⚠ This opportunity is known to charge an application fee. Always verify on the funder\'s website before applying.</div>' : ''}
    <div class="fee-disclaimer">Always verify deadlines, fees, and eligibility directly on the funder\'s website — details may change.</div>
    <div class="modal-footer">
      <a href="${o.url}" target="_blank" rel="noopener" class="apply-btn">Visit & Apply →</a>
      <button class="modal-save-btn ${saved?'saved':''}" id="msb-${id}" onclick="toggleSave(event,${id});refreshModalSave(${id})">${saved?'★ Saved':'☆ Save'}</button>
      <button class="modal-share-btn" onclick="shareOpportunity(event,${id})">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Share
      </button>
      <button class="cal-btn" onclick="addToCalendar(${id})">Add to Calendar</button>
      <button class="ig-btn ig-btn-secondary" style="padding:0.55rem 0.9rem;font-size:0.58rem" onclick="openIgCard(${id})">Share to Instagram</button>
    </div>
    ${(()=>{
      const sim=getSimilar(o);
      if(!sim.length) return '';
      return '<div style="margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--divider)"><div style="font-family:DM Mono,monospace;font-size:0.58rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:1rem">Similar opportunities</div><div style="display:flex;flex-direction:column;gap:0.6rem">'+sim.map(s=>'<div onclick="openModal('+s.id+')" style="cursor:pointer;padding:0.8rem 1rem;border:1px solid var(--divider);transition:background 0.15s" onmouseover="this.style.background=\'var(--cream)\'" onmouseout="this.style.background=\'\'"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem"><div><div style="font-size:0.95rem;font-weight:400;margin-bottom:0.2rem">'+s.title+'</div><div style="font-size:0.8rem;color:var(--muted);font-style:italic">'+s.org+'</div></div><span class="tag tag-'+s.type+'" style="flex-shrink:0">'+s.type+'</span></div></div>').join('')+'</div></div>';
    })()}
    `;
  document.getElementById('modal').classList.add('open');
  try { history.pushState(null, '', '#' + id); } catch(e) {}
}

function refreshModalSave(id) {
  const btn = document.getElementById('msb-'+id);
  if (!btn) return;
  const saved = savedIds.has(id);
  btn.className = 'modal-save-btn'+(saved?' saved':'');
  btn.textContent = saved ? '★ Saved' : '☆ Save';
}


function closeModal() { document.getElementById('modal').classList.remove('open'); try { history.pushState(null, '', window.location.pathname); } catch(e) {} }
function closeModalOverlay(e) { if(e.target.id==='modal') closeModal(); }

/* ── SUBMIT ── */
function submitOpportunity() {
  const title = document.getElementById('f-title').value.trim();
  const org   = document.getElementById('f-org').value.trim();
  const type  = document.getElementById('f-type').value;
  const loc   = document.getElementById('f-location').value.trim();
  const url   = document.getElementById('f-url').value.trim();
  if (!title || !org || !type || !loc || !url) { alert('Please fill in all required fields (marked with *).'); return; }

  const btn = document.querySelector('.submit-form-btn');
  btn.textContent = 'Sending…';
  btn.disabled = true;

  const data = {
    title, org, type, location: loc,
    region: document.getElementById('f-region').value || '',
    deadline: document.getElementById('f-deadline').value || '',
    amount: document.getElementById('f-amount').value || '',
    disciplines: document.getElementById('f-disciplines').value || '',
    description: document.getElementById('f-desc').value || '',
    eligibility: document.getElementById('f-eligibility').value || '',
    contact: document.getElementById('f-contact').value || '',
    url,
  };

  fetch('https://formspree.io/f/mlgwvjyl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(data),
  })
  .then(res => {
    if (res.ok) {
      document.getElementById('success-msg').style.display = 'block';
      ['f-title','f-org','f-type','f-location','f-region','f-deadline','f-amount','f-disciplines','f-url','f-desc','f-eligibility','f-contact'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value='';
      });
      document.getElementById('success-msg').scrollIntoView({behavior:'smooth',block:'center'});
    } else {
      alert('Something went wrong. Please try again.');
    }
  })
  .catch(() => alert('Could not send — please check your connection and try again.'))
  .finally(() => { btn.textContent = 'Submit for Review →'; btn.disabled = false; });
}

/* ── LAST UPDATED + CLOSING SOON + NEW BADGE ── */
const LAST_UPDATED = '2026-03-23'; // update this date when you add new listings

function initBanner() {
  // Last updated — use LAST_UPDATED but parse safely with UTC to avoid timezone offset issues
  const lu = document.getElementById('lastUpdated');
  const [y,m,d] = LAST_UPDATED.split('-').map(Number);
  const date = new Date(y, m-1, d); // local time, no timezone shift
  const fmt = date.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  lu.textContent = `Last updated ${fmt} · ${allOpps().length} opportunities listed`;

  // Closing soon (within 14 days)
  const now = new Date();
  const soon = allOpps().filter(o => {
    const days = Math.ceil((new Date(o.deadline) - now) / 86400000);
    return days >= 0 && days <= 14;
  }).sort((a,b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 8);

  if (soon.length) {
    const banner = document.getElementById('closingSoon');
    const list = document.getElementById('closingSoonList');
    banner.style.display = 'block';
    list.innerHTML = soon.map(o => {
      const days = Math.ceil((new Date(o.deadline) - now) / 86400000);
      const label = days === 0 ? 'today' : days === 1 ? '1d' : `${days}d`;
      return `<div class="closing-soon-item" onclick="openModal(${o.id})">
        ${o.title} <span class="closing-soon-days">${label}</span>
      </div>`;
    }).join('');

    // drag scroll handled by initFilterDragScroll()
  }
}

function isNew(o) {
  const [y,m,d] = LAST_UPDATED.split('-').map(Number);
  const cutoff = new Date(y, m-1, d);
  cutoff.setDate(cutoff.getDate() - 7);
  // We don't have an addedDate field, so we use high IDs as proxy for recently added
  return o.id >= 221; // IDs added in latest batch
}

/* ── CALENDAR EXPORT ── */
function addToCalendar(id) {
  const o = allOpps().find(x=>x.id===id);
  if (!o) return;
  const dl = new Date(o.deadline);
  const pad = n => String(n).padStart(2,'0');
  const dt = `${dl.getFullYear()}${pad(dl.getMonth()+1)}${pad(dl.getDate())}`;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isMac = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints === 0;

  if (isIOS || isMac) {
    // iOS & Mac — download .ics, opens natively in Apple Calendar
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Open Call//opencall.ca//EN',
      'BEGIN:VEVENT',
      `UID:opencall-${o.id}@opencall.ca`,
      `DTSTART;VALUE=DATE:${dt}`,
      `DTEND;VALUE=DATE:${dt}`,
      `SUMMARY:Deadline: ${o.title}`,
      `DESCRIPTION:${o.org} — ${o.amount}\\n${o.url}`,
      `URL:${o.url}`,
      'BEGIN:VALARM',
      'TRIGGER:-P7D',
      'ACTION:DISPLAY',
      `DESCRIPTION:7 days until: ${o.title}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    const blob = new Blob([ics], {type:'text/calendar;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${o.title.replace(/[^a-z0-9]/gi,'-').toLowerCase()}-deadline.ics`;
    a.click();
  } else {
    // Android & desktop — open Google Calendar directly
    const title = encodeURIComponent(`Deadline: ${o.title}`);
    const details = encodeURIComponent(`${o.org} — ${o.amount}\n${o.url}`);
    const dates = `${dt}/${dt}`;
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`;
    window.open(url, '_blank');
  }
}

/* ── NEWSLETTER ── */
function subscribeNewsletter() {
  const email = document.getElementById('newsletter-email').value.trim();
  if (!email || !email.includes('@')) {
    alert('Please enter a valid email address.');
    return;
  }
  const btn = document.querySelector('.newsletter-btn');
  btn.textContent = 'Subscribed ✓';
  btn.style.background = 'var(--green)';
  btn.disabled = true;
  // Wire up to your email service here — e.g. Mailchimp/Beehiiv embed or Formspree
  // For now stores locally as confirmation
  try { localStorage.setItem('opencall_subscribed', email); } catch(e) {}
}

/* ── INSTAGRAM CARD GENERATOR ── */
let igCurrentId = null;

function openIgCard(id) {
  igCurrentId = id;
  document.getElementById('igModal').classList.add('open');
  setTimeout(() => drawIgCard(id), 50);
}

function closeIgModal(e) {
  if (e.target.id === 'igModal') document.getElementById('igModal').classList.remove('open');
}

function drawIgCard(id) {
  const o = allOpps().find(x=>x.id===id);
  if (!o) return;
  const canvas = document.getElementById('igCanvas');
  const ctx = canvas.getContext('2d');
  const W = 1080, H = 1080;
  canvas.width = W; canvas.height = H;

  // Background
  ctx.fillStyle = '#0e0d0b';
  ctx.fillRect(0,0,W,H);

  // Rust left bar
  ctx.fillStyle = '#c4622d';
  ctx.fillRect(0,0,8,H);

  // Type badge top left
  const typeColors = {grant:'#c4622d',exhibition:'#b89a52',residency:'#5a7a5a',prize:'#5a5a8a',fellowship:'#7a5a3a',emergency:'#8a3a3a'};
  ctx.fillStyle = typeColors[o.type] || '#c4622d';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'left';
  const badgeW = ctx.measureText(o.type.toUpperCase()).width + 28;
  ctx.fillRect(80, 80, badgeW, 36);
  ctx.fillStyle = 'white';
  ctx.fillText(o.type.toUpperCase(), 94, 104);

  // Title
  ctx.fillStyle = '#f5f0e8';
  ctx.textAlign = 'left';
  const titleWords = o.title.split(' ');
  let line = '', titleLines = [];
  ctx.font = '300 72px serif';
  for (const word of titleWords) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > W-180 && line) { titleLines.push(line); line = word; }
    else line = test;
  }
  if (line) titleLines.push(line);
  titleLines = titleLines.slice(0,2);
  const titleSize = titleLines.length > 1 ? 64 : 72;
  ctx.font = `300 ${titleSize}px serif`;
  titleLines.forEach((l,i) => ctx.fillText(l, 80, 185 + i*(titleSize+10)));

  const afterTitle = 185 + titleLines.length*(titleSize+10);

  // Org
  ctx.fillStyle = 'rgba(245,240,232,0.45)';
  ctx.font = '300 28px serif';
  ctx.fillText(o.org, 80, afterTitle + 40);

  // Divider
  ctx.fillStyle = 'rgba(245,240,232,0.1)';
  ctx.fillRect(80, afterTitle + 65, W-160, 1);

  // Description — wrapped, 3 lines max
  const descY = afterTitle + 105;
  ctx.fillStyle = 'rgba(245,240,232,0.7)';
  ctx.font = '300 26px serif';
  const descWords = (o.description || '').split(' ');
  let dLine = '', dLines = [];
  for (const word of descWords) {
    const test = dLine + (dLine ? ' ' : '') + word;
    if (ctx.measureText(test).width > W-180 && dLine) { dLines.push(dLine); dLine = word; }
    else dLine = test;
    if (dLines.length >= 3) break;
  }
  if (dLine && dLines.length < 3) dLines.push(dLine);
  if (dLines.length === 3 && descWords.length > dLines.join(' ').split(' ').length) {
    dLines[2] = dLines[2].replace(/\s+\S+$/, '…');
  }
  dLines.forEach((l,i) => ctx.fillText(l, 80, descY + i*38));

  const afterDesc = descY + dLines.length*38 + 30;

  // Discipline tags
  ctx.font = 'bold 18px monospace';
  let tagX = 80;
  const tagColor = typeColors[o.type] || '#c4622d';
  o.discipline.slice(0,5).forEach(tag => {
    const tw = ctx.measureText(tag.toUpperCase()).width + 24;
    if (tagX + tw > W - 80) return;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(tagX, afterDesc, tw, 32);
    ctx.strokeStyle = tagColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(tagX, afterDesc, tw, 32);
    ctx.fillStyle = tagColor;
    ctx.fillText(tag.toUpperCase(), tagX+12, afterDesc+21);
    tagX += tw + 10;
  });

  const afterTags = afterDesc + 60;

  // Three key details
  ctx.fillStyle = 'rgba(245,240,232,0.12)';
  ctx.fillRect(80, afterTags, W-160, 1);

  const colW = (W - 160) / 3;
  const detailItems = [
    ['DEADLINE', isRolling(o) ? 'Rolling' : new Date(o.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})],
    ['AWARD', o.amount],
    ['LOCATION', o.location.split(',')[0]],
  ];
  detailItems.forEach(([label, val], i) => {
    const x = 80 + i * colW;
    const y = afterTags + 30;
    const maxW = colW - 24;

    ctx.fillStyle = 'rgba(245,240,232,0.3)';
    ctx.font = '400 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y);

    ctx.fillStyle = '#f5f0e8';
    ctx.font = '400 26px serif';

    // Clip to column width before drawing value
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + 10, maxW, 36);
    ctx.clip();
    ctx.fillText(val, x, y + 34);
    ctx.restore();
  });

  // OPEN CALL — centered in the empty space below details
  const emptyAreaTop = afterTags + 80;
  const emptyAreaBottom = H - 24;
  const centerY = emptyAreaTop + (emptyAreaBottom - emptyAreaTop) / 2 + titleSize / 3;
  ctx.fillStyle = 'rgba(245,240,232,1)';
  ctx.font = `100 ${titleSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.2em';
  // manually add letter spacing by drawing each character spaced out
  const text = 'OPEN CALL';
  const spacing = titleSize * 0.18;
  ctx.font = `100 ${titleSize}px serif`;
  // measure total width with spacing
  let totalW = 0;
  for (const ch of text) totalW += ctx.measureText(ch).width + (ch === ' ' ? spacing * 1.5 : spacing);
  let cx = W/2 - totalW/2;
  for (const ch of text) {
    ctx.fillText(ch, cx, centerY);
    cx += ctx.measureText(ch).width + (ch === ' ' ? spacing * 1.5 : spacing);
  }

  // Bottom rust strip with URL
  ctx.fillStyle = '#c4622d';
  ctx.fillRect(0, H-52, W, 52);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '400 24px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('opencall.ca', 24, H-18);
}

function downloadIgCard() {
  const canvas = document.getElementById('igCanvas');
  const o = allOpps().find(x=>x.id===igCurrentId);
  const a = document.createElement('a');
  a.download = `opencall-${o ? o.title.replace(/[^a-z0-9]/gi,'-').toLowerCase() : 'listing'}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

/* ── KEYBOARD ── */
document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });

/* ── INIT ── */
updateBadges();
renderGrid();
initBanner();
// Deep link: open modal if URL has a listing hash e.g. opencall.ca/#42
(function() {
  const hash = window.location.hash.replace('#', '');
  if (hash && !isNaN(hash)) openModal(parseInt(hash));
})();
// Scroll to top button
window.addEventListener('scroll', () => {
  document.getElementById('scrollTopBtn').classList.toggle('visible', window.scrollY > 400);
});

  // Expose all interactive functions to global scope so inline onclick handlers can reach them
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.closeModalOverlay = closeModalOverlay;
  window.toggleSave = toggleSave;
  window.shareOpportunity = shareOpportunity;
  window.doShareCopy = doShareCopy;
  window.addToCalendar = addToCalendar;
  window.calShowAll = calShowAll;
  window.calPrev = calPrev;
  window.calNext = calNext;
  window.calGoToday = calGoToday;
  window.refreshModalSave = refreshModalSave;
  window.openIgCard = openIgCard;
  window.closeIgModal = closeIgModal;
  window.downloadIgCard = downloadIgCard;
  window.exportSavedText = exportSavedText;
  window.exportSavedCSV = exportSavedCSV;
  window.filterEligibility = filterEligibility;
  window.filterMedium = filterMedium;
  window.filterRegion = filterRegion;
  window.goHome = goHome;
  window.submitOpportunity = submitOpportunity;
  window.switchTab = switchTab;
  window.toggleDark = toggleDark;

} // end init()
