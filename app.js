// ─────────────────────────────────────────────────────────────────
//  Pycno Tracker — App Logic
// ─────────────────────────────────────────────────────────────────

// ── Tile layers ──────────────────────────────────────────────────
const TILES = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA",
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attr: "&copy; <a href='https://opentopomap.org'>OpenTopoMap</a> contributors",
  },
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
  },
};

// ── Status helpers ───────────────────────────────────────────────
function getStatus(row) {
  const c = CONFIG.COLUMNS;
  const processed = (row[c.processed] || "").trim().toLowerCase();
  const result    = (row[c.result]    || "").trim().toLowerCase();
  if (processed !== "yes") return "unprocessed";
  if (result === "positive") return "positive";
  if (result === "negative") return "negative";
  return "pending";
}

const STATUS_COLOR = {
  positive:    "#16a370",
  negative:    "#8a8880",
  pending:     "#c47a15",
  unprocessed: "#2f7ec7",
};

const STATUS_LABEL = {
  positive:    "Positive detection",
  negative:    "Negative",
  pending:     "Processing",
  unprocessed: "Not yet processed",
};

// ── State ────────────────────────────────────────────────────────
let allSites   = [];
let activeFilter = "all";
let selectedId   = null;
let markers      = {};
let currentTileLayer = null;
let map;

// ── Map init ─────────────────────────────────────────────────────
function initMap() {
  map = L.map("map", {
    center: CONFIG.MAP_CENTER,
    zoom: CONFIG.MAP_ZOOM,
    zoomControl: true,
  });
  setTile("satellite");
}

function setTile(style) {
  if (currentTileLayer) map.removeLayer(currentTileLayer);
  const t = TILES[style];
  currentTileLayer = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 });
  currentTileLayer.addTo(map);
}

// ── Custom marker icon ───────────────────────────────────────────
function makeIcon(status, selected = false) {
  const color = STATUS_COLOR[status];
  const size  = selected ? 20 : 14;
  const ring  = selected ? 30 : 22;
  return L.divIcon({
    className: "",
    iconSize:  [ring, ring],
    iconAnchor:[ring / 2, ring / 2],
    html: `<div style="
      width:${ring}px; height:${ring}px;
      display:flex; align-items:center; justify-content:center;">
      <div style="
        width:${size}px; height:${size}px; border-radius:50%;
        background:${color};
        border: 2.5px solid white;
        box-shadow: 0 0 0 ${selected ? 4 : 2}px ${color}55;
        transition: all .2s;
      "></div>
    </div>`,
  });
}

// ── Data loading ─────────────────────────────────────────────────
async function loadData() {
  const sheetId   = CONFIG.SHEET_ID;
  const sheetName = encodeURIComponent(CONFIG.SHEET_NAME);

  if (sheetId === "YOUR_GOOGLE_SHEET_ID_HERE") {
    loadDemo();
    return;
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheetName}`;

  try {
    const res  = await fetch(url);
    const text = await res.text();
    // Google wraps response in  /*O_o*/ google.visualization.Query.setResponse(…);
    const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
    const rows = parseGviz(json);
    allSites = rows;
    render();
    document.getElementById("lastUpdated").textContent = "Updated " + new Date().toLocaleTimeString();
  } catch (e) {
    console.error(e);
    document.getElementById("errorBanner").style.display = "flex";
    loadDemo();
  }
}

function parseGviz(json) {
  const cols = json.table.cols.map(c => c.label);
  return json.table.rows
    .filter(r => r && r.c && r.c.some(c => c && c.v !== null))
    .map((r, i) => {
      const obj = { _id: i };
      cols.forEach((col, j) => {
        const cell = r.c[j];
        obj[col] = cell ? (cell.f || cell.v || "") : "";
      });
      return obj;
    });
}

function loadDemo() {
  // Sample data shown when no sheet is connected
  allSites = [
    { _id:0, "Site Name":"River Bend — Station 1", Latitude:"9.8843", Longitude:"-84.0511", "Date Sampled":"2026-04-12", Surveyor:"M. Vargas", Processed:"Yes", Result:"Positive", Notes:"Strong signal detected near water intake. Recommend follow-up transect." },
    { _id:1, "Site Name":"North Lagoon", Latitude:"9.9102", Longitude:"-84.0287", "Date Sampled":"2026-04-18", Surveyor:"K. Saito", Processed:"Yes", Result:"Negative", Notes:"No detection. Conditions were good. Retest in 3 months." },
    { _id:2, "Site Name":"Wetland Edge W2", Latitude:"9.8721", Longitude:"-84.0198", "Date Sampled":"2026-05-03", Surveyor:"M. Vargas", Processed:"No", Result:"", Notes:"Sample in transit to lab." },
    { _id:3, "Site Name":"Headwater Pool", Latitude:"9.9340", Longitude:"-84.0612", "Date Sampled":"2026-05-20", Surveyor:"L. Mora", Processed:"No", Result:"", Notes:"Collected last field day. Turbidity was high." },
    { _id:4, "Site Name":"Creek Fork South", Latitude:"9.8650", Longitude:"-84.0050", "Date Sampled":"2026-05-28", Surveyor:"K. Saito", Processed:"Yes", Result:"Positive", Notes:"Second confirmed detection in this zone." },
    { _id:5, "Site Name":"Reservoir Inlet", Latitude:"9.9230", Longitude:"-84.0420", "Date Sampled":"2026-05-29", Surveyor:"L. Mora", Processed:"Yes", Result:"Negative", Notes:"" },
  ];
  render();
  document.getElementById("lastUpdated").textContent = "Demo data — connect your sheet in config.js";
}

// ── Render ───────────────────────────────────────────────────────
function render() {
  updateStats();
  renderSiteList();
  renderMarkers();
}

function updateStats() {
  const s = allSites;
  document.getElementById("statTotal").textContent = s.length;
  document.getElementById("statPos").textContent   = s.filter(r => getStatus(r) === "positive").length;
  document.getElementById("statNeg").textContent   = s.filter(r => getStatus(r) === "negative").length;
  document.getElementById("statPend").textContent  = s.filter(r => getStatus(r) === "pending" || getStatus(r) === "unprocessed").length;
}

function filteredSites() {
  if (activeFilter === "all") return allSites;
  return allSites.filter(r => getStatus(r) === activeFilter);
}

function renderSiteList() {
  const list = document.getElementById("siteList");
  const sites = filteredSites();

  if (!sites.length) {
    list.innerHTML = `<div class="loading-msg">No sites match this filter.</div>`;
    return;
  }

  const c = CONFIG.COLUMNS;
  list.innerHTML = sites.map(row => {
    const status = getStatus(row);
    const color  = STATUS_COLOR[status];
    const name   = row[c.site_name] || "Unnamed site";
    const date   = row[c.date]      || "—";
    const who    = row[c.surveyor]  || "—";
    const sel    = selectedId === row._id;
    return `<div class="site-row ${sel ? "selected" : ""}" data-id="${row._id}">
      <div class="site-dot" style="background:${color}"></div>
      <div class="site-row-info">
        <div class="site-row-name">${name}</div>
        <div class="site-row-meta">${date} &middot; ${who}</div>
      </div>
      <div class="site-row-status" style="color:${color}">${STATUS_LABEL[status]}</div>
    </div>`;
  }).join("");

  list.querySelectorAll(".site-row").forEach(el => {
    el.addEventListener("click", () => selectSite(parseInt(el.dataset.id)));
  });
}

function renderMarkers() {
  // Remove old markers
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  const c = CONFIG.COLUMNS;
  filteredSites().forEach(row => {
    const lat = parseFloat(row[c.latitude]);
    const lng = parseFloat(row[c.longitude]);
    if (isNaN(lat) || isNaN(lng)) return;

    const status = getStatus(row);
    const marker = L.marker([lat, lng], { icon: makeIcon(status, selectedId === row._id) });
    marker.on("click", () => selectSite(row._id));
    marker.addTo(map);
    markers[row._id] = marker;
  });
}

// ── Site selection ───────────────────────────────────────────────
function selectSite(id) {
  selectedId = id;
  renderSiteList();
  renderMarkers();

  const row = allSites.find(r => r._id === id);
  if (!row) return;

  showDetail(row);

  // Pan map to site
  const c = CONFIG.COLUMNS;
  const lat = parseFloat(row[c.latitude]);
  const lng = parseFloat(row[c.longitude]);
  if (!isNaN(lat) && !isNaN(lng)) {
    map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: true });
  }
}

function showDetail(row) {
  const c      = CONFIG.COLUMNS;
  const status = getStatus(row);
  const color  = STATUS_COLOR[status];

  document.getElementById("detailEmpty").style.display   = "none";
  document.getElementById("detailContent").style.display = "block";

  document.getElementById("dStatusDot").style.background = color;
  document.getElementById("dName").textContent   = row[c.site_name] || "Unnamed";
  document.getElementById("dBadge").textContent  = STATUS_LABEL[status];
  document.getElementById("dBadge").style.color  = color;
  document.getElementById("dBadge").style.borderColor = color + "55";

  const lat  = row[c.latitude]  || "—";
  const lng  = row[c.longitude] || "—";
  const gps  = (lat !== "—" && lng !== "—") ? `${lat}, ${lng}` : "—";

  document.getElementById("dFields").innerHTML = [
    ["GPS",          gps],
    ["Date sampled", row[c.date]      || "—"],
    ["Surveyor",     row[c.surveyor]  || "—"],
    ["Processed",    row[c.processed] || "—"],
    ["Result",       row[c.result]    || "—"],
  ].map(([label, val]) => `
    <div class="dfield">
      <div class="dfield-label">${label}</div>
      <div class="dfield-value">${val}</div>
    </div>
  `).join("");

  const notes = row[c.notes] || "";
  const notesBlock = document.getElementById("dNotesBlock");
  if (notes.trim()) {
    notesBlock.style.display = "block";
    document.getElementById("dNotes").textContent = notes;
  } else {
    notesBlock.style.display = "none";
  }
}

function clearSelection() {
  selectedId = null;
  document.getElementById("detailEmpty").style.display   = "flex";
  document.getElementById("detailContent").style.display = "none";
  renderSiteList();
  renderMarkers();
}

// ── Event listeners ──────────────────────────────────────────────
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderSiteList();
    renderMarkers();
  });
});

document.querySelectorAll(".map-style-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".map-style-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    setTile(btn.dataset.style);
  });
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  document.getElementById("siteList").innerHTML = `<div class="loading-msg">Refreshing…</div>`;
  loadData();
});

document.getElementById("detailClose").addEventListener("click", clearSelection);

// ── Boot ─────────────────────────────────────────────────────────
initMap();
loadData();
