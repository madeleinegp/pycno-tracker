// ─────────────────────────────────────────────────────────────────
//  Pycno Tracker — Records page (iNaturalist + GBIF)
// ─────────────────────────────────────────────────────────────────

const CA = { minLat: 32.5, maxLat: 42.0, minLng: -124.5, maxLng: -114.0 };
const YEAR_FROM = 2010;
const INAT_PLACE_ID = 14; // California
const GBIF_TAXON_KEY = 2274565; // Pycnopodia helianthoides — verified gbif.org/species/2274565
const GBIF_FETCH_BUDGET = 900; // records pulled from GBIF (of ~247k available — see README caveat)
const MAX_ROWS = 60;    // list render cap, performance guard
const MAX_MARKERS = 300; // map marker cap, performance guard

const SRC_COLOR = { inat: "var(--inat)", gbif: "var(--gbif)" };
const SRC_COLOR_RAW = { inat: "#4C7A16", gbif: "#2F6FA8" };

const TILES = {
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Tiles &copy; Esri" },
  street: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "&copy; OpenStreetMap contributors" }
};

function gradeInfo(g) {
  if (g === "research") return { label: "Research grade", color: "#17795A", border: "rgba(23,121,90,.4)" };
  if (g === "needs_id") return { label: "Needs ID", color: "#B4741A", border: "rgba(180,116,26,.4)" };
  if (g === "gbif") return { label: "GBIF record", color: "#2F6FA8", border: "rgba(47,111,168,.4)" };
  return { label: "Casual", color: "#6E6A5F", border: "#CFC9BC" };
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const state = {
  obs: [], source: "all", year: "", query: "",
  expandedId: null, modalId: null, tile: "satellite",
  loading: true, status: "Querying iNaturalist & GBIF…",
  lastUpdated: "Loading…", error: ""
};
let gbifTotal = null;
let map, tileLayer, markers = {}, mapEl, lastFocused = null, syncTimer = null;

function setStatus(s) { state.status = s; document.getElementById("statusText").textContent = s; }

// ── Data load ──────────────────────────────────────────────────
async function fetchINat() {
  const out = [];
  const perPage = 200;
  let page = 1, total = null;
  while (true) {
    setStatus("iNaturalist — page " + page);
    const url = `https://api.inaturalist.org/v1/observations?taxon_name=Pycnopodia%20helianthoides&place_id=${INAT_PLACE_ID}&quality_grade=research&d1=${YEAR_FROM}-01-01&per_page=${perPage}&page=${page}&order=desc&order_by=observed_on&geo=true`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (total === null) total = data.total_results || 0;
      if (!data.results || !data.results.length) break;
      for (const r of data.results) {
        const lat = r.location ? parseFloat(r.location.split(",")[0]) : null;
        const lng = r.location ? parseFloat(r.location.split(",")[1]) : null;
        if (!lat || !lng) continue;
        if (lat < CA.minLat || lat > CA.maxLat || lng < CA.minLng || lng > CA.maxLng) continue;
        out.push({
          _id: "inat-" + r.id, source: "inat", lat, lng,
          place: r.place_guess || "California",
          date: r.observed_on || "—",
          year: r.observed_on ? r.observed_on.slice(0, 4) : "—",
          user: r.user ? r.user.login : "—",
          grade: r.quality_grade || "casual",
          photo: r.photos && r.photos.length ? r.photos[0].url.replace("square", "medium") : null,
          url: "https://www.inaturalist.org/observations/" + r.id
        });
      }
      if (out.length >= total || data.results.length < perPage || page >= 15) break;
      page++;
    } catch (e) { break; }
  }
  return out;
}

async function fetchGBIF() {
  const out = [];
  const limit = 300;
  for (let offset = 0; offset < GBIF_FETCH_BUDGET; offset += limit) {
    setStatus("GBIF — records " + (offset + 1) + "–" + (offset + limit));
    const url = `https://api.gbif.org/v1/occurrence/search?taxonKey=${GBIF_TAXON_KEY}&hasCoordinate=true&occurrenceStatus=PRESENT&decimalLatitude=${CA.minLat},${CA.maxLat}&decimalLongitude=${CA.minLng},${CA.maxLng}&year=${YEAR_FROM},2026&limit=${limit}&offset=${offset}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (typeof data.count === "number") gbifTotal = data.count;
      if (!data.results || !data.results.length) break;
      for (const r of data.results) {
        // Defensive check even with the server-side filter above — some datasets
        // report presence/absence surveys (e.g. organismQuantity: 0) inconsistently.
        if (r.occurrenceStatus && String(r.occurrenceStatus).toUpperCase() === "ABSENT") continue;
        if (r.organismQuantity === 0) continue;
        if (!r.decimalLatitude || !r.decimalLongitude) continue;
        if (r.decimalLatitude < CA.minLat || r.decimalLatitude > CA.maxLat) continue;
        if (r.decimalLongitude < CA.minLng || r.decimalLongitude > CA.maxLng) continue;
        out.push({
          _id: "gbif-" + r.key, source: "gbif",
          lat: r.decimalLatitude, lng: r.decimalLongitude,
          place: r.locality || r.county || r.stateProvince || "California",
          date: r.eventDate ? r.eventDate.slice(0, 10) : (r.year ? String(r.year) : "—"),
          year: r.year ? String(r.year) : "—",
          user: r.recordedBy || r.institutionCode || r.collectionCode || "—",
          grade: "gbif",
          photo: r.media && r.media.length ? r.media[0].identifier : null,
          url: "https://www.gbif.org/occurrence/" + r.key,
          dataset: r.datasetName || null
        });
      }
      if (data.endOfRecords) break;
    } catch (e) { break; }
  }
  return out;
}

async function load() {
  state.loading = true; state.status = "Querying iNaturalist & GBIF…"; state.error = "";
  render();
  let inat = [], gbif = [];
  try {
    [inat, gbif] = await Promise.all([fetchINat(), fetchGBIF()]);
  } catch (e) {
    state.loading = false; state.error = "Query failed: " + e.message;
    render();
    return;
  }
  state.obs = inat.concat(gbif);
  state.loading = false;
  state.lastUpdated = state.obs.length ? "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "No data";
  state.error = state.obs.length ? "" : "No records returned — likely a network or API issue. Try refreshing.";
  render();
  fitAll();
}

function fitAll(tries) {
  tries = tries || 0;
  if (!map) { if (tries < 40) setTimeout(() => fitAll(tries + 1), 250); return; }
  const pts = state.obs.filter(o => o.lat && o.lng).map(o => [o.lat, o.lng]);
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
}

function visible() {
  const q = state.query.trim().toLowerCase();
  return state.obs.filter(o => {
    if (state.source !== "all" && o.source !== state.source) return false;
    if (state.year && o.year !== state.year) return false;
    if (q && !(String(o.place).toLowerCase().includes(q) || String(o.user).toLowerCase().includes(q))) return false;
    return true;
  });
}

function fieldsFor(o) {
  const f = [
    { label: "Date", value: o.date },
    { label: "Observer", value: o.user },
    { label: "Quality grade", value: gradeInfo(o.grade).label },
    { label: "Coords", value: Number(o.lat).toFixed(4) + ", " + Number(o.lng).toFixed(4) }
  ];
  if (o.dataset) f.push({ label: "Dataset", value: o.dataset });
  return f;
}

// ── Map ────────────────────────────────────────────────────────
function bootMap() {
  mapEl = document.getElementById("map");
  map = L.map(mapEl, { center: [37.5, -122.5], zoom: 6, scrollWheelZoom: false });
  applyTile();
  syncMarkers();
}

function applyTile() {
  if (!map) return;
  if (tileLayer) map.removeLayer(tileLayer);
  const t = TILES[state.tile] || TILES.satellite;
  tileLayer = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(map);
}

function icon(source, sel) {
  const c = SRC_COLOR_RAW[source];
  const size = sel ? 17 : 11, ring = sel ? 27 : 19;
  return L.divIcon({ className: "", iconSize: [ring, ring], iconAnchor: [ring / 2, ring / 2],
    html: `<div style="width:${ring}px;height:${ring}px;display:flex;align-items:center;justify-content:center;"><div style="width:${size}px;height:${size}px;border-radius:50%;background:${c};border:2px solid #F3F1EC;box-shadow:0 0 0 ${sel ? 3 : 1}px ${c}66;"></div></div>` });
}

function syncMarkers() {
  if (!map) return;
  const sel = state.modalId || state.expandedId;
  const want = visible().slice(0, MAX_MARKERS).filter(o => o.lat && o.lng);
  const keep = new Set(want.map(o => o._id));
  Object.keys(markers).forEach(id => {
    if (!keep.has(id)) { map.removeLayer(markers[id]); delete markers[id]; }
  });
  want.forEach(o => {
    const isSel = sel === o._id;
    const existing = markers[o._id];
    if (existing) {
      if (existing._pycnoSel !== isSel) { existing.setIcon(icon(o.source, isSel)); existing._pycnoSel = isSel; }
      return;
    }
    const m = L.marker([o.lat, o.lng], { icon: icon(o.source, isSel) });
    m._pycnoSel = isSel;
    m.bindTooltip(o.place + " · " + o.date, { direction: "top", offset: [0, -8] });
    m.on("click", () => { state.modalId = o._id; render(); });
    m.addTo(map);
    markers[o._id] = m;
  });
}

function scheduleSyncMarkers() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncMarkers, 180);
}

function zoomTo(o) {
  if (!map || !o.lat) return;
  map.setView([o.lat, o.lng], Math.max(map.getZoom(), 10), { animate: true });
  if (mapEl) window.scrollTo({ top: mapEl.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
}

// ── Render ─────────────────────────────────────────────────────
function render() {
  const inatCount = state.obs.filter(o => o.source === "inat").length;
  const gbifCount = state.obs.length - inatCount;
  const vis = visible();
  const shown = vis.slice(0, MAX_ROWS);
  const years = Array.from(new Set(state.obs.map(o => o.year).filter(y => y && y !== "—" && parseInt(y) >= YEAR_FROM))).sort().reverse();

  document.getElementById("lastUpdated").textContent = state.lastUpdated;
  document.getElementById("mapLoading").hidden = !state.loading;
  document.getElementById("statAll").textContent = state.obs.length ? state.obs.length.toLocaleString() : "—";
  document.getElementById("statInat").textContent = state.obs.length ? inatCount.toLocaleString() : "—";
  document.getElementById("statGbif").textContent = state.obs.length ? gbifCount.toLocaleString() : "—";
  document.getElementById("gbifNote").textContent = gbifTotal ? "GBIF loaded — of " + gbifTotal.toLocaleString() + " available" : "GBIF";
  document.getElementById("shownLabel").textContent = state.loading ? "Loading…" : (vis.length === state.obs.length ? vis.length.toLocaleString() + " records" : vis.length.toLocaleString() + " of " + state.obs.length.toLocaleString() + " records");

  document.getElementById("btnSatellite").classList.toggle("active", state.tile === "satellite");
  document.getElementById("btnStreet").classList.toggle("active", state.tile === "street");

  // Source pills
  const sourceDefs = [["all", "All"], ["inat", "iNaturalist"], ["gbif", "GBIF"]];
  document.getElementById("sourcePills").innerHTML = sourceDefs.map(([key, label]) => {
    const count = key === "all" ? state.obs.length : (key === "inat" ? inatCount : gbifCount);
    return `<button class="filter-pill ${state.source === key ? "active" : ""}" data-source="${key}">${esc(label)} <span class="count">${count}</span></button>`;
  }).join("");

  // Year select — rebuild options, then restore selection
  const yearSelect = document.getElementById("yearSelect");
  yearSelect.innerHTML = `<option value="">All (2010–present)</option>` + years.map(y => `<option value="${y}">${y}</option>`).join("");
  yearSelect.value = state.year;

  // List
  const listBody = document.getElementById("listBody");
  const emptyState = document.getElementById("emptyState");
  const truncNote = document.getElementById("truncNote");
  if (!state.loading && vis.length === 0) {
    listBody.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = state.error || "No records match these filters.";
  } else {
    emptyState.hidden = true;
    listBody.innerHTML = shown.map(o => renderRow(o)).join("");
  }
  if (vis.length > shown.length) {
    truncNote.hidden = false;
    truncNote.textContent = "Showing " + shown.length + " of " + vis.length.toLocaleString() + " — narrow with the year filter or search.";
  } else {
    truncNote.hidden = true;
  }

  renderModal();
  scheduleSyncMarkers();
  attachHandlers();
}

function renderRow(o) {
  const g = gradeInfo(o.grade);
  const expanded = state.expandedId === o._id;
  let html = `<div class="list-row ${expanded ? "expanded" : ""}">
    <button class="list-row-btn list-grid-records" data-row="${esc(o._id)}" aria-expanded="${expanded}">
      <span class="row-name-cell"><span class="row-dot" style="--row-color:${SRC_COLOR[o.source]}"></span><span class="row-name">${esc(o.place)}</span></span>
      <span class="row-date">${esc(o.date)}</span>
      <span class="row-sub">${esc(o.user)}</span>
      <span class="row-grade" style="--row-color:${g.color};--grade-border:${g.border}">${esc(g.label)}</span>
      <span class="row-caret">${expanded ? "–" : "+"}</span>
    </button>`;
  if (expanded) {
    const fields = fieldsFor(o);
    const extLabel = o.source === "inat" ? "View on iNaturalist ↗" : "View on GBIF ↗";
    html += `<div class="row-detail">
      <div class="row-detail-grid">
        ${o.photo ? `<img class="row-photo" src="${esc(o.photo)}" alt="Occurrence photo">` : `<div class="row-photo-placeholder">No photo</div>`}
        <div>
          <div class="field-grid">${fields.map(f => `<div class="field-cell"><div class="field-label">${esc(f.label)}</div><div class="field-value">${esc(f.value)}</div></div>`).join("")}</div>
          <div class="row-actions">
            <button class="btn-outline" data-zoom="${esc(o._id)}">Show on map</button>
            <a class="btn-link" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(extLabel)}</a>
          </div>
        </div>
      </div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

function attachHandlers() {
  document.getElementById("listBody").querySelectorAll("[data-row]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.row;
      state.expandedId = state.expandedId === id ? null : id;
      render();
    });
  });
  document.getElementById("listBody").querySelectorAll("[data-zoom]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const o = state.obs.find(x => x._id === btn.dataset.zoom);
      if (o) zoomTo(o);
    });
  });
  document.getElementById("sourcePills").querySelectorAll("[data-source]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.source = btn.dataset.source;
      state.expandedId = null;
      render();
    });
  });
}

// ── Modal ──────────────────────────────────────────────────────
function renderModal() {
  const backdrop = document.getElementById("modalBackdrop");
  const o = state.modalId ? state.obs.find(x => x._id === state.modalId) : null;
  if (!o) { backdrop.hidden = true; return; }
  backdrop.hidden = false;
  document.getElementById("modalSource").style.setProperty("--modal-color", SRC_COLOR[o.source]);
  document.getElementById("modalSourceText").textContent = o.source === "inat" ? "iNaturalist" : "GBIF";
  document.getElementById("modalTitle").textContent = o.place;
  document.getElementById("modalPhotoWrap").innerHTML = o.photo
    ? `<img class="modal-photo" src="${esc(o.photo)}" alt="Occurrence photo">`
    : `<div class="modal-photo-placeholder">No photo</div>`;
  document.getElementById("modalFields").innerHTML = fieldsFor(o).map(f => `<div class="field-cell"><div class="field-label">${esc(f.label)}</div><div class="field-value">${esc(f.value)}</div></div>`).join("");
  const extLabel = o.source === "inat" ? "View on iNaturalist ↗" : "View on GBIF ↗";
  document.getElementById("modalLinkWrap").innerHTML = `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(extLabel)}</a>`;
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
document.getElementById("yearSelect").addEventListener("change", e => { state.year = e.target.value; state.expandedId = null; render(); });
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
