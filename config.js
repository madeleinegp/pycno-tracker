// ─────────────────────────────────────────────────────────────────
//  Pycno Tracker — Configuration
//  Edit this file to connect your Google Sheet.
// ─────────────────────────────────────────────────────────────────

const CONFIG = {

  // 1. Paste your Google Sheet ID here.
  //    It's the long string in your sheet URL:
  //    https://docs.google.com/spreadsheets/d/  ← THIS PART →  /edit
  SHEET_ID: "YOUR_GOOGLE_SHEET_ID_HERE",

  // 2. The name of the tab/sheet inside your spreadsheet (default: Sheet1)
  SHEET_NAME: "Sites",

  // 3. Default map center [latitude, longitude] — set to your study area
  MAP_CENTER: [9.9, -84.05],

  // 4. Default zoom level (1=world, 18=building). 12–14 is good for field sites.
  MAP_ZOOM: 12,

  // 5. Project name shown in the header
  PROJECT_NAME: "Pycno Tracker",

  // ── Column name mapping ──────────────────────────────────────────
  // These must match your Google Sheet column headers exactly.
  COLUMNS: {
    site_name:  "Site Name",
    latitude:   "Latitude",
    longitude:  "Longitude",
    date:       "Date Sampled",
    surveyor:   "Surveyor",
    processed:  "Processed",   // values: "Yes" or "No"
    result:     "Result",      // values: "Positive", "Negative", or leave blank
    notes:      "Notes",
  }

};
