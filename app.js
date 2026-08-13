// ─────────────────────────────────────────────────────────────────
//  Pycno Tracker — Sites page
// ─────────────────────────────────────────────────────────────────

const COLS = CONFIG.COLUMNS;

const COLOR = { positive: "var(--positive)", negative: "var(--negative)", pending: "var(--pending)", unprocessed: "var(--unprocessed)" };
const COLOR_RAW = { positive: "#17795A", negative: "#6E6A5F", pending: "#B4741A", unprocessed: "#2F6FA8" };
const LABEL = { positive: "Positive detection", negative: "Negative", pending: "Processing", unprocessed: "Not yet processed" };

const TILES = {
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Tiles &copy; Esri — Esri, USGS, NOAA" },
  street: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "&copy; OpenStreetMap contributors" }
};

// Sample rows shown only if the live sheet can't be reached
const DEMO = [
  { _id: 0, [COLS.site_name]: "Point Loma Kelp Forest", [COLS.latitude]: "32.6693", [COLS.longitude]: "-117.2530", [COLS.date]: "2026-03-04", [COLS.surveyor]: "M. Grant", [COLS.processed]: "Yes", [COLS.result]: "Positive", [COLS.notes]: "Strong amplification in both replicates at 12 m. Recommend a paired diver transect before the fall sampling round." },
  { _id: 1, [COLS.site_name]: "La Jolla Cove", [COLS.latitude]: "32.8503", [COLS.longitude]: "-117.2727", [COLS.date]: "2026-03-05", [COLS.surveyor]: "R. Okafor", [COLS.processed]: "Yes", [COLS.result]: "Negative", [COLS.notes]: "Clean negative, good filtration volume. Retest in three months." },
  { _id: 2, [COLS.site_name]: "Naples Reef", [COLS.latitude]: "34.4225", [COLS.longitude]: "-119.9520", [COLS.date]: "2026-04-11", [COLS.surveyor]: "M. Grant", [COLS.processed]: "Yes", [COLS.result]: "Negative", [COLS.notes]: "" },
  { _id: 3, [COLS.site_name]: "Anacapa Landing Cove", [COLS.latitude]: "34.0146", [COLS.longitude]: "-119.3611", [COLS.date]: "2026-04-19", [COLS.surveyor]: "T. Alvarez", [COLS.processed]: "No", [COLS.result]: "", [COLS.notes]: "Two 1 L replicates in transit to the lab." },
  { _id: 4, [COLS.site_name]: "Point Buchon", [COLS.latitude]: "35.2536", [COLS.longitude]: "-120.8952", [COLS.date]: "2026-05-02", [COLS.surveyor]: "M. Grant", [COLS.processed]: "Yes", [COLS.result]: "Positive", [COLS.notes]: "Second consecutive positive at this station. Sub-adult observed by the survey team the same day." },
  { _id: 5, [COLS.site_name]: "Stillwater Cove — Carmel", [COLS.latitude]: "36.5606", [COLS.longitude]: "-121.9440", [COLS.date]: "2026-05-14", [COLS.surveyor]: "K. Reyes", [COLS.processed]: "Yes", [COLS.result]: "", [COLS.notes]: "Inhibition suspected; re-extraction queued." },
  { _id: 6, [COLS.site_name]: "Hopkins Marine Reserve", [COLS.latitude]: "36.6217", [COLS.longitude]: "-121.9040", [COLS.date]: "2026-05-21", [COLS.surveyor]: "K. Reyes", [COLS.processed]: "No", [COLS.result]: "", [COLS.notes]: "Collected on the last field day, high turbidity." },
  { _id: 7, [COLS.site_name]: "Duxbury Reef", [COLS.latitude]: "37.8917", [COLS.longitude]: "-122.7010", [COLS.date]: "2026-06-02", [COLS.surveyor]: "T. Alvarez", [COLS.processed]: "Yes", [COLS.result]: "Positive", [COLS.notes]: "Faint but reproducible signal across three replicates." },
  { _id: 8, [COLS.site_name]: "Bodega Head", [COLS.latitude]: "38.3040", [COLS.longitude]: "-123.0680", [COLS.date]: "2026-06-15", [COLS.surveyor]: "R. Okafor", [COLS.processed]: "Yes", [COLS.result]: "Negative", [COLS.notes]: "" },
  { _id: 9, [COLS.site_name]: "Van Damme Cove", [COLS.latitude]: "39.2735", [COLS.longitude]: "-123.7930", [COLS.date]: "2026-07-01", [COLS.surveyor]: "K. Reyes", [COLS.processed]: "No", [COLS.result]: "", [COLS.notes]: "Shore-based sample, heavy surge." },
  { _id: 10, [COLS.site_name]: "Trinidad Head", [COLS.latitude]: "41.0553", [COLS.longitude]: "-124.1490", [COLS.date]: "2026-07-12", [COLS.surveyor]: "M. Grant", [COLS.processed]: "Yes", [COLS.result]: "Positive", [COLS.notes]: "Northernmost positive this season." },
  { _id: 11, [COLS.site_name]: "Crescent City Harbor", [COLS.latitude]: "41.7450", [COLS.longitude]: "-124.1830", [COLS.date]: "2026-07-20", [COLS.surveyor]: "T. Alvarez", [COLS.processed]: "Yes", [COLS.result]: "", [COLS.notes]: "Awaiting confirmatory run." }
];

function statusOf(row) {
  const processed = String(row[COLS.processed] || "").trim().toLowerCase();
  const result = String(row[COLS.result] || "").trim().toLowerCase();
  if (processed !== "yes") return "unprocessed";
  if (result === "positive") return "positive";
  if (result === "negative") return "negative";
  return "pending";
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const state = {
  sites: [],
  filter: "all",
  query: "",
  expandedId: null,
  modalId: null,
  tile: "satellite",
  lastUpdated: "Loading…",
  sourceNote: ""
};

let map, tileLayer, markers = {}, mapEl, lastFocused = null;

function fieldsFor(row) {
  const lat = row[COLS.latitude] || "—", lng = row[COLS.longitude] || "—";
  return [
    { label: "GPS", value: (lat !== "—" && lng !== "—") ? lat + ", " + lng : "—" },
    { label: "Date sampled", value: row[COLS.date] || "—" },
    { label: "Surveyor", value: row[COLS.surveyor] || "—" },
    { label: "Processed", value: row[COLS.processed] || "—" },
    { label: "Result", value: row[COLS.result] || "—" }
  ];
}

function visible() {
  const q = state.query.trim().toLowerCase();
  return state.sites.filter(r => {
    if (state.filter !== "all" && statusOf(r) !== state.filter) return false;
    if (!q) return true;
    return [COLS.site_name, COLS.surveyor, COLS.notes, COLS.date].some(k => String(r[k] || "").toLowerCase().includes(q));
  });
}

// ── Data load ──────────────────────────────────────────────────
async function load() {
  document.getElementById("lastUpdated").textContent = "Refreshing…";
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
    const cols = json.table.cols.map(c => c.label);
    const rows = json.table.rows.filter(r => r && r.c && r.c.some(c => c && c.v !== null)).map((r, i) => {
      const o = { _id: i };
      cols.forEach((col, j) => { const cell = r.c[j]; o[col] = cell ? (cell.f || cell.v || "") : ""; });
      return o;
    });
    if (!rows.length) throw new Error("empty sheet");
    state.sites = rows;
    state.lastUpdated = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    state.sourceNote = 'Source — Google Sheet "' + CONFIG.SHEET_NAME + '"';
  } catch (e) {
    state.sites = DEMO;
    state.lastUpdated = "Sample data";
    state.sourceNote = "Sheet unreachable — showing sample rows";
  }
  render();
  fitAll();
}

function fitAll(tries) {
  tries = tries || 0;
  if (!map) { if (tries < 40) setTimeout(() => fitAll(tries + 1), 250); return; }
  const pts = state.sites.map(r => [parseFloat(r[COLS.latitude]), parseFloat(r[COLS.longitude])]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
}

// ── Map ────────────────────────────────────────────────────────
function bootMap() {
  mapEl = document.getElementById("map");
  map = L.map(mapEl, { center: CONFIG.MAP_CENTER, zoom: CONFIG.MAP_ZOOM, scrollWheelZoom: false });
  applyTile();
  syncMarkers();
}

function applyTile() {
  if (!map) return;
  if (tileLayer) map.removeLayer(tileLayer);
  const t = TILES[state.tile] || TILES.satellite;
  tileLayer = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(map);
}

function icon(status, sel) {
  const c = COLOR_RAW[status];
  const size = sel ? 19 : 13, ring = sel ? 30 : 22;
  return L.divIcon({ className: "", iconSize: [ring, ring], iconAnchor: [ring / 2, ring / 2],
    html: `<div style="width:${ring}px;height:${ring}px;display:flex;align-items:center;justify-content:center;"><div style="width:${size}px;height:${size}px;border-radius:50%;background:${c};border:2.5px solid #F3F1EC;box-shadow:0 0 0 ${sel ? 4 : 2}px ${c}55;"></div></div>` });
}

function syncMarkers() {
  if (!map) return;
  const sel = state.modalId != null ? state.modalId : state.expandedId;
  const want = visible().filter(row => {
    const lat = parseFloat(row[COLS.latitude]), lng = parseFloat(row[COLS.longitude]);
    return !isNaN(lat) && !isNaN(lng);
  });
  const keep = new Set(want.map(r => r._id));
  Object.keys(markers).forEach(id => {
    if (!keep.has(Number(id))) { map.removeLayer(markers[id]); delete markers[id]; }
  });
  want.forEach(row => {
    const isSel = sel === row._id;
    const lat = parseFloat(row[COLS.latitude]), lng = parseFloat(row[COLS.longitude]);
    const existing = markers[row._id];
    if (existing) {
      if (existing._pycnoSel !== isSel) { existing.setIcon(icon(statusOf(row), isSel)); existing._pycnoSel = isSel; }
      return;
    }
    const m = L.marker([lat, lng], { icon: icon(statusOf(row), isSel) });
    m._pycnoSel = isSel;
    m.bindTooltip(String(row[COLS.site_name] || "Unnamed site") + " · " + (row[COLS.date] || ""), { direction: "top", offset: [0, -10] });
    m.on("click", () => { state.modalId = row._id; render(); });
    m.addTo(map);
    markers[row._id] = m;
  });
}

function zoomTo(row) {
  if (!map) return;
  const lat = parseFloat(row[COLS.latitude]), lng = parseFloat(row[COLS.longitude]);
  if (isNaN(lat) || isNaN(lng)) return;
  map.setView([lat, lng], Math.max(map.getZoom(), 12), { animate: true });
  if (mapEl) window.scrollTo({ top: mapEl.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
}

// ── Render ─────────────────────────────────────────────────────
function render() {
  const all = state.sites;
  const count = k => all.filter(r => statusOf(r) === k).length;
  const vis = visible();

  document.getElementById("lastUpdated").textContent = state.lastUpdated;
  document.getElementById("sourceNote").textContent = state.sourceNote;
  document.getElementById("statTotal").textContent = all.length || "—";
  document.getElementById("statPos").textContent = count("positive");
  document.getElementById("statNeg").textContent = count("negative");
  document.getElementById("statPend").textContent = count("pending") + count("unprocessed");
  document.getElementById("shownLabel").textContent = vis.length === all.length ? all.length + " records" : vis.length + " of " + all.length + " records";

  document.getElementById("btnSatellite").classList.toggle("active", state.tile === "satellite");
  document.getElementById("btnStreet").classList.toggle("active", state.tile === "street");

  // Filter pills
  const filterDefs = [["all", "All"], ["positive", "Positive"], ["negative", "Negative"], ["pending", "Pending"], ["unprocessed", "Unprocessed"]];
  document.getElementById("filterPills").innerHTML = filterDefs.map(([key, label]) => `
    <button class="filter-pill ${state.filter === key ? "active" : ""}" data-filter="${key}">${esc(label)} <span class="count">${key === "all" ? all.length : count(key)}</span></button>
  `).join("");

  // List
  const listBody = document.getElementById("listBody");
  const emptyState = document.getElementById("emptyState");
  if (all.length > 0 && vis.length === 0) {
    listBody.innerHTML = "";
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    listBody.innerHTML = vis.map(row => renderRow(row)).join("");
  }

  renderModal();
  syncMarkers();
  attachRowHandlers();
}

function renderRow(row) {
  const st = statusOf(row);
  const expanded = state.expandedId === row._id;
  const name = row[COLS.site_name] || "Unnamed site";
  let html = `<div class="list-row ${expanded ? "expanded" : ""}">
    <button class="list-row-btn list-grid-sites" data-row="${row._id}" aria-expanded="${expanded}">
      <span class="row-name-cell"><span class="row-dot" style="--row-color:${COLOR[st]}"></span><span class="row-name">${esc(name)}</span></span>
      <span class="row-date">${esc(row[COLS.date] || "—")}</span>
      <span class="row-sub">${esc(row[COLS.surveyor] || "—")}</span>
      <span class="row-status" style="--row-color:${COLOR[st]}">${esc(LABEL[st])}</span>
      <span class="row-caret">${expanded ? "–" : "+"}</span>
    </button>`;
  if (expanded) {
    const fields = fieldsFor(row);
    const notes = row[COLS.notes] || "";
    html += `<div class="row-detail">
      <div class="field-grid">${fields.map(f => `<div class="field-cell"><div class="field-label">${esc(f.label)}</div><div class="field-value">${esc(f.value)}</div></div>`).join("")}</div>
      ${notes.trim() ? `<div class="notes-block"><div class="notes-label">Field notes</div><p class="notes-text">${esc(notes)}</p></div>` : ""}
      <div class="row-actions"><button class="btn-outline" data-zoom="${row._id}">Show on map</button></div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function attachRowHandlers() {
  document.getElementById("listBody").querySelectorAll("[data-row]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.row);
      state.expandedId = state.expandedId === id ? null : id;
      render();
    });
  });
  document.getElementById("listBody").querySelectorAll("[data-zoom]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const row = state.sites.find(r => r._id === Number(btn.dataset.zoom));
      if (row) zoomTo(row);
    });
  });
  document.getElementById("filterPills").querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      state.expandedId = null;
      render();
    });
  });
}

// ── Modal ──────────────────────────────────────────────────────
function renderModal() {
  const backdrop = document.getElementById("modalBackdrop");
  const row = state.modalId != null ? state.sites.find(r => r._id === state.modalId) : null;
  if (!row) { backdrop.hidden = true; return; }
  const st = statusOf(row);
  backdrop.hidden = false;
  document.getElementById("modalSource").style.setProperty("--modal-color", COLOR[st]);
  document.getElementById("modalStatusText").textContent = LABEL[st];
  document.getElementById("modalTitle").textContent = row[COLS.site_name] || "Unnamed site";
  document.getElementById("modalFields").innerHTML = fieldsFor(row).map(f => `<div class="field-cell"><div class="field-label">${esc(f.label)}</div><div class="field-value">${esc(f.value)}</div></div>`).join("");
  const notes = row[COLS.notes] || "";
  const notesBlock = document.getElementById("modalNotesBlock");
  if (notes.trim()) { notesBlock.hidden = false; document.getElementById("modalNotes").textContent = notes; }
  else { notesBlock.hidden = true; }
}

function closeModal() {
  state.modalId = null;
  render();
  if (lastFocused && document.body.contains(lastFocused)) lastFocused.focus();
  lastFocused = null;
}

function trapFocus(e) {
  if (e.key === "Escape") { closeModal(); return; }
  if (e.key !== "Tab") return;
  const panel = document.getElementById("modalPanel");
  const focusable = panel.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
}

// ── Wire up ────────────────────────────────────────────────────
document.getElementById("refreshBtn").addEventListener("click", load);
document.getElementById("btnSatellite").addEventListener("click", () => { state.tile = "satellite"; applyTile(); render(); });
document.getElementById("btnStreet").addEventListener("click", () => { state.tile = "street"; applyTile(); render(); });
document.getElementById("searchInput").addEventListener("input", e => { state.query = e.target.value; render(); });
document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalBackdrop").addEventListener("click", e => { if (e.target.id === "modalBackdrop") closeModal(); });
document.addEventListener("keydown", e => { if (!document.getElementById("modalBackdrop").hidden) trapFocus(e); });

const _origRenderModal = renderModal;
renderModal = function () {
  const wasOpen = !document.getElementById("modalBackdrop").hidden;
  _origRenderModal();
  const isOpen = !document.getElementById("modalBackdrop").hidden;
  if (isOpen && !wasOpen) { lastFocused = document.activeElement; document.getElementById("modalClose").focus(); }
};

bootMap();
load();
