// ─────────────────────────────────────────────────────────────────
//  Pycno Tracker — Configuration
// ─────────────────────────────────────────────────────────────────

const CONFIG = {

  SHEET_ID: "1FM-uJl2iXZkCX5MOlc6eTlLQy8rLx2F1zQOm0GGp8is",

  SHEET_NAME: "Sites",

  // Centered on Central California coast to cover all your sites
  MAP_CENTER: [37.5, -122.0],
  MAP_ZOOM: 7,

  PROJECT_NAME: "Pycno Tracker",

  // Must match your Google Sheet column headers exactly
  COLUMNS: {
    site_name:  "Site Name",
    latitude:   "Latitude",
    longitude:  "Longitude",
    date:       "Date Sampled",
    surveyor:   "Surveyor",
    processed:  "Processed",   // "Yes" or "No"
    result:     "Result",      // "Positive", "Negative", or blank
    notes:      "Notes",
  },

  // Coastwide sampling network (separate workbook — multi-institution coordination sheet)
  NETWORK_SHEET_ID: "1JN5d6QYsW4gKvZxne6WHeJYJSMNmM2u-v9o2B3NqlTA",
  NETWORK_SHEET_NAME: "eDNA Sites"

};
