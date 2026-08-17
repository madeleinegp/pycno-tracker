// ─────────────────────────────────────────────────────────────────
//  Pycno Tracker — Coastwide sampling network
//  Live-fetches CONFIG.NETWORK_SHEET_ID / NETWORK_SHEET_NAME. If that sheet
//  is unreachable, falls back to the bundled snapshot in network-data.js
//  (compiled from a one-off CSV hand-off — see that file's header comment).
// ─────────────────────────────────────────────────────────────────

const netState = { filter: "all", query: "", tile: "satellite", expandedId: null, modalId: null };
let netSites = [];              // working dataset — live rows, or fallback snapshot
let netSourceNote = "Loading…";
let netMap, netTileLayer, netMarkers = {}, netMapEl, netLastFocused = null;

const NET_TILES = {
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Tiles &copy; Esri" },
  street: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "&copy; OpenStreetMap contributors" }
};

function esc2(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// "41°03'22.0"N" style coords — two rows in the source sheet use this instead of decimal degrees.
function dmsToDD(s) {
  const m = String(s || "").trim().match(/(\d+)°(\d+)'([\d.]+)"?\s*([NSEW])/i);
  if (!m) return null;
  let dd = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  if (/[SW]/i.test(m[4])) dd = -dd;
  return dd;
}

function toNum(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  // Strict full-string match — parseFloat alone would happily read "41" out of
  // "41°03'22.0"N" and stop, silently discarding the DMS remainder as garbage.
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  return dmsToDD(s);
}

// The sheet has an instructional row above the real header row ("Do not change
// this column…" then "Folder, Region, Research Group…"). gviz's own header
// detection is unreliable when every candidate row is plain text, so check for
// known real column names and self-correct if it picked the wrong row.
function parseSheetTable(text, expectedMarkers) {
  const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
  let cols = json.table.cols.map(c => c.label || "");
  let rows = json.table.rows || [];
  const looksReal = arr => expectedMarkers.every(m => arr.includes(m));
  if (!looksReal(cols) && rows.length) {
    const firstRowVals = rows[0].c.map(c => String((c && (c.f ?? c.v)) ?? ""));
    if (looksReal(firstRowVals)) { cols = firstRowVals; rows = rows.slice(1); }
  }
  return { cols, rows };
}

async function netLoad() {
  netSourceNote = "Loading…";
  netRenderStatusOnly();
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.NETWORK_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.NETWORK_SHEET_NAME)}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    const { cols, rows } = parseSheetTable(text, ["Region", "Name", "Latitude", "Longitude"]);
    const idx = label => cols.indexOf(label);
    const val = (r, label) => {
      const i = idx(label);
      if (i < 0 || !r.c[i]) return "";
      const cell = r.c[i];
      return String((cell.f ?? cell.v) ?? "").trim();
    };
    const parsed = rows
      .filter(r => r && r.c)
      .map(r => {
        const name = val(r, "Name");
        const purpose = val(r, "Primary purpose");
        const group = val(r, "Research Group");
        return {
          name, purpose, group,
          siteCode: val(r, "SiteCode"),
          region: val(r, "Region"),
          lead: val(r, "Lead"),
          lat: toNum(val(r, "Latitude")),
          lng: toNum(val(r, "Longitude")),
          date: val(r, "Date"),
          status: val(r, "Sample Status"),
          season: val(r, "Season"),
          ednaBenthic: val(r, "# eDNA benthic"),
          ednaSurface: val(r, "# eDNA surface"),
          intertidal: val(r, "# intertidal") || val(r, "# intertidal "),
          collection: val(r, "Types of eDNA collection"),
          storage: val(r, "Type of storage (Frozen only/Ethanol)"),
          notes: val(r, "Notes"),
          vpecOnly: purpose.trim() === "Water for Vpec." || group.trim() === "TNC"
        };
      })
      .filter(r => r.name && !/^(name|add site name)/i.test(r.name));
    if (!parsed.length) throw new Error("empty sheet");
    netSites = parsed;
    netSourceNote = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " — live from sheet";
  } catch (e) {
    netSites = NETWORK_SITES;
    netSourceNote = "Sheet unreachable — showing last compiled snapshot";
  }
  netSites.forEach((r, i) => { r._id = i; });
  netBootOrRefreshMap();
  netRender();
}

function netRenderStatusOnly() {
  const el = document.getElementById("netSourceNote");
  if (el) el.textContent = netSourceNote;
}

function netVisible() {
  const q = netState.query.trim().toLowerCase();
  return netSites.filter(r => {
    if (netState.filter === "vpec" && !r.vpecOnly) return false;
    if (netState.filter === "edna" && r.vpecOnly) return false;
    if (!q) return true;
    return [r.name, r.region, r.group, r.lead, r.notes, r.siteCode].some(v => String(v || "").toLowerCase().includes(q));
  });
}

function netFieldsFor(r) {
  const f = [];
  if (r.region) f.push({ label: "Region", value: r.region });
  if (r.group) f.push({ label: "Research group", value: r.group });
  if (r.lead) f.push({ label: "Lead", value: r.lead });
  if (r.siteCode) f.push({ label: "Site code", value: r.siteCode });
  if (r.lat != null && r.lng != null) f.push({ label: "GPS", value: r.lat.toFixed(4) + ", " + r.lng.toFixed(4) });
  if (r.date) f.push({ label: "Date", value: r.date });
  if (r.status) f.push({ label: "Sample status", value: r.status });
  if (r.season) f.push({ label: "Season", value: r.season });
  const bits = [];
  if (r.ednaBenthic) bits.push(r.ednaBenthic + " benthic");
  if (r.ednaSurface) bits.push(r.ednaSurface + " surface");
  if (r.intertidal) bits.push(r.intertidal + " intertidal");
  if (bits.length) f.push({ label: "Sample counts", value: bits.join(", ") });
  if (r.collection) f.push({ label: "Collection type", value: r.collection });
  if (r.storage) f.push({ label: "Storage", value: r.storage });
  return f;
}

// ── Map ────────────────────────────────────────────────────────
function netBootOrRefreshMap() {
  if (!netMap) {
    netMapEl = document.getElementById("netMap");
    netMap = L.map(netMapEl, { center: [42, -122], zoom: 4, scrollWheelZoom: false });
    netApplyTile();
  }
  const pts = netSites.filter(r => r.lat != null && r.lng != null).map(r => [r.lat, r.lng]);
  if (pts.length) netMap.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
}

function netApplyTile() {
  if (!netMap) return;
  if (netTileLayer) netMap.removeLayer(netTileLayer);
  const t = NET_TILES[netState.tile] || NET_TILES.satellite;
  netTileLayer = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(netMap);
}

function netIcon(vpecOnly, sel) {
  const c = vpecOnly ? "#B04A22" : "#17150F";
  const size = sel ? 17 : 11, ring = sel ? 27 : 19;
  const shape = vpecOnly
    ? `border-radius:2px; transform:rotate(45deg);`
    : `border-radius:50%;`;
  return L.divIcon({ className: "", iconSize: [ring, ring], iconAnchor: [ring / 2, ring / 2],
    html: `<div style="width:${ring}px;height:${ring}px;display:flex;align-items:center;justify-content:center;"><div style="width:${size}px;height:${size}px;${shape}background:${c};border:2px solid #F3F1EC;box-shadow:0 0 0 ${sel ? 3 : 1}px ${c}66;"></div></div>` });
}

function netSyncMarkers() {
  if (!netMap) return;
  const sel = netState.modalId != null ? netState.modalId : netState.expandedId;
  const want = netVisible().filter(r => r.lat != null && r.lng != null);
  const keep = new Set(want.map(r => r._id));
  Object.keys(netMarkers).forEach(id => {
    if (!keep.has(Number(id))) { netMap.removeLayer(netMarkers[id]); delete netMarkers[id]; }
  });
  want.forEach(r => {
    const isSel = sel === r._id;
    const existing = netMarkers[r._id];
    if (existing) {
      if (existing._pycnoSel !== isSel) { existing.setIcon(netIcon(r.vpecOnly, isSel)); existing._pycnoSel = isSel; }
      return;
    }
    const m = L.marker([r.lat, r.lng], { icon: netIcon(r.vpecOnly, isSel) });
    m._pycnoSel = isSel;
    m.bindTooltip(r.name + (r.vpecOnly ? " · V. pec only" : ""), { direction: "top", offset: [0, -10] });
    m.on("click", () => { netState.modalId = r._id; netRender(); });
    m.addTo(netMap);
    netMarkers[r._id] = m;
  });
}

function netZoomTo(r) {
  if (!netMap || r.lat == null) return;
  netMap.setView([r.lat, r.lng], Math.max(netMap.getZoom(), 8), { animate: true });
  if (netMapEl) window.scrollTo({ top: netMapEl.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
}

// ── Render ─────────────────────────────────────────────────────
function netRender() {
  document.getElementById("netSourceNote").textContent = netSourceNote;
  document.getElementById("netBtnSatellite").classList.toggle("active", netState.tile === "satellite");
  document.getElementById("netBtnStreet").classList.toggle("active", netState.tile === "street");
  const vis = netVisible();
  const all = netSites;
  const vpecCount = all.filter(r => r.vpecOnly).length;

  document.getElementById("netShownLabel").textContent = vis.length === all.length ? all.length + " sites" : vis.length + " of " + all.length + " sites";

  const filterDefs = [["all", "All"], ["edna", "eDNA sites"], ["vpec", "V. pec only"]];
  document.getElementById("netFilterPills").innerHTML = filterDefs.map(([key, label]) => {
    const count = key === "all" ? all.length : (key === "vpec" ? vpecCount : all.length - vpecCount);
    return `<button class="filter-pill ${netState.filter === key ? "active" : ""}" data-netfilter="${key}">${esc2(label)} <span class="count">${count}</span></button>`;
  }).join("");

  const listBody = document.getElementById("netListBody");
  const emptyState = document.getElementById("netEmptyState");
  if (vis.length === 0) {
    listBody.innerHTML = "";
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    listBody.innerHTML = vis.map(r => netRenderRow(r)).join("");
  }

  netRenderModal();
  netSyncMarkers();
  netAttachHandlers();
}

function netRenderRow(r) {
  const expanded = netState.expandedId === r._id;
  let html = `<div class="list-row ${expanded ? "expanded" : ""}">
    <button class="list-row-btn list-grid-network" data-netrow="${r._id}" aria-expanded="${expanded}">
      <span class="row-name-cell"><span class="row-name">${esc2(r.name)}</span>${r.vpecOnly ? '<span class="vpec-badge">V. pec only</span>' : ""}</span>
      <span class="row-sub">${esc2(r.region || "—")}</span>
      <span class="row-sub">${esc2(r.group || "—")}</span>
      <span class="row-purpose">${esc2(r.purpose || "—")}</span>
      <span class="row-caret">${expanded ? "–" : "+"}</span>
    </button>`;
  if (expanded) {
    const fields = netFieldsFor(r);
    const notes = r.notes || "";
    html += `<div class="row-detail">
      <div class="field-grid">${fields.map(f => `<div class="field-cell"><div class="field-label">${esc2(f.label)}</div><div class="field-value">${esc2(f.value)}</div></div>`).join("")}</div>
      ${notes.trim() ? `<div class="notes-block"><div class="notes-label">Notes</div><p class="notes-text">${esc2(notes)}</p></div>` : ""}
      ${r.lat != null ? `<div class="row-actions"><button class="btn-outline" data-netzoom="${r._id}">Show on map</button></div>` : ""}
    </div>`;
  }
  html += `</div>`;
  return html;
}

function netAttachHandlers() {
  document.getElementById("netListBody").querySelectorAll("[data-netrow]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.netrow);
      netState.expandedId = netState.expandedId === id ? null : id;
      netRender();
    });
  });
  document.getElementById("netListBody").querySelectorAll("[data-netzoom]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const r = netSites.find(x => x._id === Number(btn.dataset.netzoom));
      if (r) netZoomTo(r);
    });
  });
  document.getElementById("netFilterPills").querySelectorAll("[data-netfilter]").forEach(btn => {
    btn.addEventListener("click", () => {
      netState.filter = btn.dataset.netfilter;
      netState.expandedId = null;
      netRender();
    });
  });
}

// ── Modal ──────────────────────────────────────────────────────
function netRenderModal() {
  const backdrop = document.getElementById("netModalBackdrop");
  const r = netState.modalId != null ? netSites.find(x => x._id === netState.modalId) : null;
  if (!r) { backdrop.hidden = true; return; }
  backdrop.hidden = false;
  const color = r.vpecOnly ? "#B04A22" : "#17150F";
  document.getElementById("netModalSource").style.setProperty("--modal-color", color);
  document.getElementById("netModalGroupText").textContent = r.vpecOnly ? "V. pectinicida only" : (r.group || "eDNA sampling site");
  document.getElementById("netModalTitle").textContent = r.name;
  document.getElementById("netModalFields").innerHTML = netFieldsFor(r).map(f => `<div class="field-cell"><div class="field-label">${esc2(f.label)}</div><div class="field-value">${esc2(f.value)}</div></div>`).join("");
  const notes = r.notes || "";
  const notesBlock = document.getElementById("netModalNotesBlock");
  if (notes.trim()) { notesBlock.hidden = false; document.getElementById("netModalNotes").textContent = notes; }
  else { notesBlock.hidden = true; }
}

function netCloseModal() {
  netState.modalId = null;
  netRender();
  if (netLastFocused && document.body.contains(netLastFocused)) netLastFocused.focus();
  netLastFocused = null;
}

function netTrapFocus(e) {
  if (e.key === "Escape") { netCloseModal(); return; }
  if (e.key !== "Tab") return;
  const panel = document.getElementById("netModalPanel");
  const focusable = panel.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
}

// ── Wire up ────────────────────────────────────────────────────
document.getElementById("netRefreshBtn").addEventListener("click", netLoad);
document.getElementById("netBtnSatellite").addEventListener("click", () => { netState.tile = "satellite"; netApplyTile(); netRender(); });
document.getElementById("netBtnStreet").addEventListener("click", () => { netState.tile = "street"; netApplyTile(); netRender(); });
document.getElementById("netSearchInput").addEventListener("input", e => { netState.query = e.target.value; netRender(); });
document.getElementById("netModalClose").addEventListener("click", netCloseModal);
document.getElementById("netModalBackdrop").addEventListener("click", e => { if (e.target.id === "netModalBackdrop") netCloseModal(); });
document.addEventListener("keydown", e => { if (!document.getElementById("netModalBackdrop").hidden) netTrapFocus(e); });

const _origNetRenderModal = netRenderModal;
netRenderModal = function () {
  const wasOpen = !document.getElementById("netModalBackdrop").hidden;
  _origNetRenderModal();
  const isOpen = !document.getElementById("netModalBackdrop").hidden;
  if (isOpen && !wasOpen) { netLastFocused = document.activeElement; document.getElementById("netModalClose").focus(); }
};

netLoad();
