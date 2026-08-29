#!/bin/bash
set -e
mkdir -p datacheck && cd datacheck

cat > index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Datacheck — is your CSV usable?</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

  <header class="topbar">
    <div class="wrap topbar-inner">
      <div class="brand">
        <span class="brand-mark">DC</span>
        <span class="brand-name">Datacheck</span>
      </div>
      <p class="brand-tag">A quick health check for your spreadsheet — no code required.</p>
    </div>
  </header>

  <main class="wrap">

    <!-- UPLOAD VIEW -->
    <section id="upload-view" class="view">
      <div class="upload-zone" id="drop-zone">
        <input type="file" id="file-input" accept=".csv" hidden>
        <div class="upload-icon">↥</div>
        <h1>Drop a CSV file here</h1>
        <p class="muted">or <button class="link-btn" id="browse-btn">choose a file</button> from your computer</p>
        <p class="fine-print">Nothing leaves your browser. Your file is never uploaded anywhere.</p>
      </div>
      <p class="try-sample">
        Don't have a file handy? <button class="link-btn" id="sample-btn">Try a sample file</button>
      </p>
    </section>

    <!-- LOADING -->
    <section id="loading-view" class="view hidden">
      <p class="muted center">Reading your file…</p>
    </section>

    <!-- RESULTS VIEW -->
    <section id="results-view" class="view hidden">

      <div class="results-header">
        <div>
          <p class="file-label" id="file-name">—</p>
          <h1 id="verdict-headline">—</h1>
          <p class="muted" id="verdict-sub">—</p>
        </div>
        <div class="header-actions">
          <button class="btn" id="download-btn">Download cleaned file</button>
          <button class="btn btn-ghost" id="new-file-btn">Check another file</button>
        </div>
      </div>

      <!-- summary cards -->
      <div class="card-grid" id="summary-cards"></div>

      <!-- per-column breakdown -->
      <section class="block">
        <h2>Columns</h2>
        <p class="muted block-sub">What's in each column, and how complete it is.</p>
        <div id="column-grid" class="column-grid"></div>
      </section>

      <!-- issues -->
      <section class="block">
        <h2>Issues found</h2>
        <p class="muted block-sub">Specific rows that may need attention, in plain terms.</p>
        <div id="issues-list" class="issues-list"></div>
      </section>

      <!-- raw data -->
      <section class="block">
        <div class="table-header">
          <h2>Your data</h2>
          <label class="filter-toggle">
            <input type="checkbox" id="flagged-only">
            Show only flagged rows
          </label>
        </div>
        <p class="muted block-sub">First 200 rows shown. Click an issue above to jump here.</p>
        <div class="table-scroll">
          <table id="data-table"></table>
        </div>
      </section>

    </section>

  </main>

  <footer class="site-footer">
    <div class="wrap">
      <p class="muted">Built as a portfolio project. Runs entirely in your browser — CSV in, cleaner data out.</p>
    </div>
  </footer>

<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
<script src="app.js"></script>
</body>
</html>
HTMLEOF

cat > style.css << 'CSSEOF'
:root {
  --paper: #F7F5F0;
  --paper-raised: #FFFFFF;
  --ink: #1C2321;
  --ink-soft: #5B5F5A;
  --ink-faint: #8C8F89;
  --line: #E3E0D6;
  --line-strong: #CFCBBC;

  --teal: #0F6E56;
  --teal-bg: #E1F5EE;
  --amber: #8A5A0B;
  --amber-bg: #FAEEDA;
  --coral: #99341C;
  --coral-bg: #FAECE7;

  --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;

  --radius: 10px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.wrap {
  max-width: 980px;
  margin: 0 auto;
  padding: 0 24px;
}

.hidden { display: none !important; }
.muted { color: var(--ink-soft); }
.center { text-align: center; }

/* Topbar */
.topbar {
  border-bottom: 1px solid var(--line);
  padding: 20px 0;
}
.topbar-inner {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 8px; }
.brand-mark {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: var(--ink);
  color: var(--paper);
  padding: 3px 6px;
  border-radius: 4px;
}
.brand-name {
  font-size: 18px;
  font-weight: 600;
}
.brand-tag {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
}

/* Upload */
.view { padding: 56px 0; }
.upload-zone {
  border: 1.5px dashed var(--line-strong);
  border-radius: 14px;
  background: var(--paper-raised);
  padding: 64px 24px;
  text-align: center;
  transition: border-color 0.15s ease, background 0.15s ease;
  cursor: pointer;
}
.upload-zone.dragover {
  border-color: var(--teal);
  background: var(--teal-bg);
}
.upload-icon {
  font-size: 28px;
  color: var(--ink-faint);
  margin-bottom: 8px;
}
.upload-zone h1 {
  font-size: 22px;
  margin: 0 0 8px;
}
.upload-zone p { margin: 4px 0; }
.fine-print {
  font-size: 13px;
  color: var(--ink-faint);
  margin-top: 16px !important;
}
.try-sample {
  text-align: center;
  margin-top: 20px;
  color: var(--ink-soft);
  font-size: 14px;
}
.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--teal);
  font-size: inherit;
  font-family: inherit;
  text-decoration: underline;
  cursor: pointer;
}

/* Results header */
.results-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 16px;
  padding-top: 40px;
  padding-bottom: 24px;
}
.file-label {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-faint);
  margin: 0 0 6px;
}
.results-header h1 { margin: 0 0 6px; font-size: 26px; }
.results-header p { margin: 0; }
.header-actions { display: flex; gap: 10px; }

.btn {
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 600;
  padding: 9px 16px;
  border-radius: 8px;
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
  cursor: pointer;
}
.btn:hover { opacity: 0.85; }
.btn-ghost {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--line-strong);
}

/* Summary cards */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 40px;
}
.metric-card {
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 18px;
}
.metric-card .label {
  font-size: 12px;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0 0 6px;
}
.metric-card .value {
  font-family: var(--mono);
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}
.metric-card.status-ok .value { color: var(--teal); }
.metric-card.status-warn .value { color: var(--amber); }
.metric-card.status-bad .value { color: var(--coral); }

/* blocks */
.block { margin-bottom: 44px; }
.block h2 { font-size: 18px; margin: 0 0 4px; }
.block-sub { margin: 0 0 16px; font-size: 14px; }

/* columns grid */
.column-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}
.col-card {
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.col-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}
.col-name {
  font-weight: 600;
  font-size: 14px;
  word-break: break-word;
}
.col-type {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-faint);
  text-transform: uppercase;
}
.col-fill-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 6px;
}
.fill-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}
.fill-bar-inner { height: 100%; background: var(--teal); }
.fill-bar-inner.warn { background: var(--amber); }
.fill-bar-inner.bad { background: var(--coral); }
.fill-pct {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-soft);
  min-width: 34px;
  text-align: right;
}
.col-stats {
  font-size: 12px;
  color: var(--ink-soft);
  margin: 6px 0 10px;
  font-family: var(--mono);
}
.col-chart-wrap { height: 90px; margin-top: 6px; }

/* issues */
.issues-list { display: flex; flex-direction: column; gap: 8px; }
.issue-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-left: 3px solid var(--line-strong);
  border-radius: 8px;
  padding: 12px 14px;
  cursor: pointer;
}
.issue-item:hover { border-color: var(--line-strong); background: #FBFAF7; }
.issue-item.sev-warn { border-left-color: var(--amber); }
.issue-item.sev-bad { border-left-color: var(--coral); }
.issue-badge {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
  margin-top: 1px;
}
.issue-item.sev-warn .issue-badge { background: var(--amber-bg); color: var(--amber); }
.issue-item.sev-bad .issue-badge { background: var(--coral-bg); color: var(--coral); }
.issue-text { font-size: 14px; }
.issue-text .rows {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-soft);
  display: block;
  margin-top: 3px;
}
.no-issues {
  color: var(--teal);
  font-size: 14px;
  background: var(--teal-bg);
  border-radius: 8px;
  padding: 14px 16px;
}

/* table */
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}
.filter-toggle {
  font-size: 13px;
  color: var(--ink-soft);
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.table-scroll {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  max-height: 480px;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-family: var(--mono);
  font-size: 12.5px;
}
thead th {
  position: sticky;
  top: 0;
  background: var(--paper-raised);
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line-strong);
  white-space: nowrap;
}
tbody td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
tbody tr:hover { background: #FBFAF7; }
tbody tr.flagged-row { background: var(--amber-bg); }
tbody tr.flagged-row:hover { background: #F6E4C4; }
tbody tr.jump-highlight { outline: 2px solid var(--teal); outline-offset: -2px; }
td.cell-empty { color: var(--ink-faint); font-style: italic; }
td.cell-bad-type { color: var(--coral); font-weight: 700; }
.row-num { color: var(--ink-faint); }

/* footer */
.site-footer {
  border-top: 1px solid var(--line);
  padding: 24px 0 40px;
  margin-top: 20px;
}
.site-footer p { font-size: 13px; margin: 0; }

@media (max-width: 600px) {
  .results-header { flex-direction: column; align-items: flex-start; }
  .header-actions { width: 100%; }
  .btn { flex: 1; }
}
CSSEOF

cat > app.js << 'JSEOF'
// ---------- State ----------
let rawRows = [];      // array of objects, keyed by header
let headers = [];
let analysis = null;   // computed analysis result
let currentFileName = '';
let charts = [];        // Chart.js instances, kept so we can destroy on re-run

// ---------- Elements ----------
const uploadView = document.getElementById('upload-view');
const loadingView = document.getElementById('loading-view');
const resultsView = document.getElementById('results-view');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const sampleBtn = document.getElementById('sample-btn');
const newFileBtn = document.getElementById('new-file-btn');
const downloadBtn = document.getElementById('download-btn');
const flaggedOnlyToggle = document.getElementById('flagged-only');

// ---------- Upload wiring ----------
dropZone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

['dragenter', 'dragover'].forEach(evt =>
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('dragover'); })
);
['dragleave', 'drop'].forEach(evt =>
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); })
);
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

sampleBtn.addEventListener('click', () => {
  const sample = generateSampleCsv();
  handleFile(new File([sample], 'sample_employee_data.csv', { type: 'text/csv' }));
});

newFileBtn.addEventListener('click', () => {
  resultsView.classList.add('hidden');
  uploadView.classList.remove('hidden');
  fileInput.value = '';
});

flaggedOnlyToggle.addEventListener('change', () => renderTable());

downloadBtn.addEventListener('click', downloadCleanedCsv);

// ---------- File handling ----------
function handleFile(file) {
  currentFileName = file.name;
  uploadView.classList.add('hidden');
  loadingView.classList.remove('hidden');

  Papa.parse(file, {
    header: true,
    skipEmptyLines: false,
    complete: (results) => {
      headers = results.meta.fields || [];
      rawRows = results.data;
      analysis = analyzeData(headers, rawRows);
      renderResults();
      loadingView.classList.add('hidden');
      resultsView.classList.remove('hidden');
    },
    error: (err) => {
      loadingView.classList.add('hidden');
      uploadView.classList.remove('hidden');
      alert('Could not read that file. Make sure it is a valid CSV.');
    }
  });
}

// ---------- Analysis ----------
function analyzeData(headers, rows) {
  const totalRows = rows.length;

  // Identify fully blank rows
  const blankRowIndices = [];
  rows.forEach((row, i) => {
    const allEmpty = headers.every(h => isEmpty(row[h]));
    if (allEmpty) blankRowIndices.push(i);
  });

  // Duplicate detection (exact row match, ignoring fully blank rows)
  const seen = new Map();
  const duplicateIndices = [];
  rows.forEach((row, i) => {
    if (blankRowIndices.includes(i)) return;
    const key = headers.map(h => (row[h] ?? '').toString().trim().toLowerCase()).join('|');
    if (seen.has(key)) {
      duplicateIndices.push(i);
    } else {
      seen.set(key, i);
    }
  });

  // Per-column analysis
  const columns = headers.map(h => analyzeColumn(h, rows, blankRowIndices));

  // Overall issue tally for verdict
  const missingTotal = columns.reduce((sum, c) => sum + c.missingCount, 0);
  const typeMismatchTotal = columns.reduce((sum, c) => sum + c.typeMismatches.length, 0);
  const outlierTotal = columns.reduce((sum, c) => sum + c.outliers.length, 0);

  const issues = buildIssuesList({
    columns, duplicateIndices, blankRowIndices, totalRows
  });

  const verdict = buildVerdict({
    totalRows, duplicateCount: duplicateIndices.length, blankCount: blankRowIndices.length,
    missingTotal, typeMismatchTotal, columns
  });

  return {
    totalRows,
    totalCols: headers.length,
    columns,
    duplicateIndices,
    blankRowIndices,
    issues,
    verdict,
    flaggedRowSet: buildFlaggedRowSet({ columns, duplicateIndices, blankRowIndices })
  };
}

function analyzeColumn(header, rows, blankRowIndices) {
  const values = rows.map((r, i) => ({ i, v: r[header] }));
  const nonBlankRowValues = values.filter(({ i }) => !blankRowIndices.includes(i));
  const total = nonBlankRowValues.length;

  const missing = nonBlankRowValues.filter(({ v }) => isEmpty(v));
  const present = nonBlankRowValues.filter(({ v }) => !isEmpty(v));

  const type = detectColumnType(present.map(p => p.v));

  const typeMismatches = [];
  const numericVals = [];
  present.forEach(({ i, v }) => {
    if (type === 'number') {
      const n = toNumber(v);
      if (n === null) {
        typeMismatches.push({ i, v });
      } else {
        numericVals.push({ i, v: n });
      }
    }
  });

  let stats = null;
  let outliers = [];
  if (type === 'number' && numericVals.length > 0) {
    stats = computeNumericStats(numericVals.map(n => n.v));
    outliers = detectOutliers(numericVals, stats);
  }

  let topValues = null;
  if (type === 'text') {
    topValues = computeTopValues(present.map(p => p.v));
  }

  return {
    name: header,
    type,
    total,
    missingCount: missing.length,
    missingRowIndices: missing.map(m => m.i),
    fillPct: total === 0 ? 0 : Math.round((present.length / total) * 100),
    stats,
    outliers,
    typeMismatches,
    topValues
  };
}

function isEmpty(v) {
  return v === undefined || v === null || v.toString().trim() === '';
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  const cleaned = v.toString().trim().replace(/,/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function detectColumnType(presentValues) {
  if (presentValues.length === 0) return 'text';
  const sample = presentValues.slice(0, 200);
  let numericCount = 0;
  let dateCount = 0;
  sample.forEach(v => {
    if (toNumber(v) !== null) numericCount++;
    if (looksLikeDate(v)) dateCount++;
  });
  const ratio = sample.length;
  if (numericCount / ratio >= 0.7) return 'number';
  if (dateCount / ratio >= 0.7) return 'date';
  return 'text';
}

function looksLikeDate(v) {
  const s = v.toString().trim();
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
}

function computeNumericStats(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean: round2(mean),
    median: round2(median),
    q1: sorted[Math.floor(n * 0.25)],
    q3: sorted[Math.floor(n * 0.75)]
  };
}

function detectOutliers(numericVals, stats) {
  const iqr = stats.q3 - stats.q1;
  const lower = stats.q1 - 1.5 * iqr;
  const upper = stats.q3 + 1.5 * iqr;
  if (iqr === 0) return [];
  return numericVals.filter(({ v }) => v < lower || v > upper);
}

function computeTopValues(values) {
  const counts = new Map();
  values.forEach(v => {
    const key = v.toString().trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));
}

function round2(n) { return Math.round(n * 100) / 100; }

// ---------- Issues list ----------
function buildIssuesList({ columns, duplicateIndices, blankRowIndices, totalRows }) {
  const issues = [];

  if (duplicateIndices.length > 0) {
    issues.push({
      severity: duplicateIndices.length / totalRows > 0.05 ? 'bad' : 'warn',
      title: `${duplicateIndices.length} duplicate row${duplicateIndices.length === 1 ? '' : 's'}`,
      detail: 'These rows exactly match an earlier row. Usually a copy-paste or export error.',
      rowIndices: duplicateIndices
    });
  }

  if (blankRowIndices.length > 0) {
    issues.push({
      severity: 'warn',
      title: `${blankRowIndices.length} completely empty row${blankRowIndices.length === 1 ? '' : 's'}`,
      detail: 'These rows have no data in any column. Safe to remove.',
      rowIndices: blankRowIndices
    });
  }

  columns.forEach(col => {
    if (col.missingCount > 0) {
      const pct = Math.round((col.missingCount / col.total) * 100);
      issues.push({
        severity: pct > 20 ? 'bad' : 'warn',
        title: `"${col.name}" is missing ${col.missingCount} value${col.missingCount === 1 ? '' : 's'} (${pct}%)`,
        detail: pct > 20
          ? 'A significant chunk of this column is blank — check whether it was exported correctly.'
          : 'A handful of blanks. Decide whether to fill them or exclude those rows before analysis.',
        rowIndices: col.missingRowIndices
      });
    }
    if (col.typeMismatches.length > 0) {
      issues.push({
        severity: 'bad',
        title: `"${col.name}" has ${col.typeMismatches.length} value${col.typeMismatches.length === 1 ? '' : 's'} that don't look like ${col.type}s`,
        detail: `This column is mostly ${col.type}s, but some entries are text, like "${col.typeMismatches[0].v}". These will likely break calculations.`,
        rowIndices: col.typeMismatches.map(m => m.i)
      });
    }
    if (col.outliers.length > 0) {
      issues.push({
        severity: 'warn',
        title: `"${col.name}" has ${col.outliers.length} unusual value${col.outliers.length === 1 ? '' : 's'}`,
        detail: `These fall far outside the typical range for this column (typical: ${col.stats.q1}–${col.stats.q3}). Worth a manual check — could be genuine or a data entry error.`,
        rowIndices: col.outliers.map(o => o.i)
      });
    }
  });

  return issues.sort((a, b) => (a.severity === 'bad' ? -1 : 1) - (b.severity === 'bad' ? -1 : 1));
}

function buildFlaggedRowSet({ columns, duplicateIndices, blankRowIndices }) {
  const set = new Set([...duplicateIndices, ...blankRowIndices]);
  columns.forEach(col => {
    col.missingRowIndices.forEach(i => set.add(i));
    col.typeMismatches.forEach(m => set.add(m.i));
    col.outliers.forEach(o => set.add(o.i));
  });
  return set;
}

function buildVerdict({ totalRows, duplicateCount, blankCount, missingTotal, typeMismatchTotal, columns }) {
  const flaggedCount = duplicateCount + blankCount;
  const problemScore = (duplicateCount + blankCount) + missingTotal * 0.3 + typeMismatchTotal * 1.5;
  const problemRatio = totalRows === 0 ? 0 : problemScore / totalRows;

  if (typeMismatchTotal === 0 && missingTotal === 0 && duplicateCount === 0 && blankCount === 0) {
    return { level: 'ok', headline: 'This file looks clean', sub: 'No missing values, duplicates, or type issues found. Safe to use as-is.' };
  }
  if (problemRatio < 0.05 && typeMismatchTotal === 0) {
    return { level: 'ok', headline: 'Mostly clean, a few things to check', sub: 'Minor issues found below — nothing that should block you from using this data.' };
  }
  if (problemRatio < 0.2) {
    return { level: 'warn', headline: 'Usable, but clean it up first', sub: 'Several issues found that could skew an analysis. Review them below before relying on this data.' };
  }
  return { level: 'bad', headline: 'Needs work before you trust it', sub: 'A large share of this file has missing data, duplicates, or type problems. Fix the issues below first.' };
}

// ---------- Rendering ----------
function renderResults() {
  document.getElementById('file-name').textContent = currentFileName;
  document.getElementById('verdict-headline').textContent = analysis.verdict.headline;
  document.getElementById('verdict-sub').textContent = analysis.verdict.sub;

  renderSummaryCards();
  renderColumnGrid();
  renderIssuesList();
  flaggedOnlyToggle.checked = false;
  renderTable();
}

function renderSummaryCards() {
  const el = document.getElementById('summary-cards');
  const a = analysis;
  const statusFor = (n, warnAt, badAt) => n === 0 ? 'ok' : n >= badAt ? 'bad' : n >= warnAt ? 'warn' : 'ok';

  const cards = [
    { label: 'Rows', value: a.totalRows.toLocaleString(), status: '' },
    { label: 'Columns', value: a.totalCols, status: '' },
    { label: 'Duplicate rows', value: a.duplicateIndices.length, status: statusFor(a.duplicateIndices.length, 1, Math.ceil(a.totalRows * 0.05)) },
    { label: 'Empty rows', value: a.blankRowIndices.length, status: statusFor(a.blankRowIndices.length, 1, Math.ceil(a.totalRows * 0.02)) },
    { label: 'Issues found', value: a.issues.length, status: statusFor(a.issues.length, 1, 6) },
  ];

  el.innerHTML = cards.map(c => `
    <div class="metric-card status-${c.status}">
      <p class="label">${c.label}</p>
      <p class="value">${c.value}</p>
    </div>
  `).join('');
}

function renderColumnGrid() {
  const el = document.getElementById('column-grid');
  charts.forEach(c => c.destroy());
  charts = [];

  el.innerHTML = analysis.columns.map((col, idx) => `
    <div class="col-card">
      <div class="col-card-head">
        <span class="col-name">${escapeHtml(col.name)}</span>
        <span class="col-type">${col.type}</span>
      </div>
      <div class="col-fill-row">
        <div class="fill-bar"><div class="fill-bar-inner ${col.fillPct < 80 ? 'bad' : col.fillPct < 95 ? 'warn' : ''}" style="width:${col.fillPct}%"></div></div>
        <span class="fill-pct">${col.fillPct}%</span>
      </div>
      ${col.stats ? `<p class="col-stats">min ${col.stats.min} · max ${col.stats.max} · avg ${col.stats.mean} · median ${col.stats.median}</p>` : ''}
      ${col.type === 'text' && col.topValues ? `<p class="col-stats">${col.topValues.length} unique shown, top: ${escapeHtml(col.topValues[0]?.label ?? '—')}</p>` : ''}
      <div class="col-chart-wrap"><canvas id="col-chart-${idx}"></canvas></div>
    </div>
  `).join('');

  analysis.columns.forEach((col, idx) => renderColumnChart(col, idx));
}

function renderColumnChart(col, idx) {
  const ctx = document.getElementById(`col-chart-${idx}`);
  if (!ctx) return;

  if (col.type === 'number' && col.stats) {
    const values = rawRows
      .map(r => toNumber(r[col.name]))
      .filter(v => v !== null);
    const bins = makeHistogramBins(values, 8);
    charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: bins.map(b => b.label),
        datasets: [{ data: bins.map(b => b.count), backgroundColor: '#0F6E56', borderRadius: 2 }]
      },
      options: chartOptionsMinimal(`Distribution for ${col.name}`)
    }));
  } else if (col.type === 'text' && col.topValues) {
    charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: col.topValues.map(t => truncate(t.label, 10)),
        datasets: [{ data: col.topValues.map(t => t.count), backgroundColor: '#0F6E56', borderRadius: 2 }]
      },
      options: chartOptionsMinimal(`Top values for ${col.name}`)
    }));
  } else {
    ctx.closest('.col-chart-wrap').style.display = 'none';
  }
}

function makeHistogramBins(values, binCount) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: String(min), count: values.length }];
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    label: Math.round(min + i * width).toString(),
    count: 0
  }));
  values.forEach(v => {
    let idx = Math.floor((v - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].count++;
  });
  return bins;
}

function chartOptionsMinimal(ariaLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: { ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true }, grid: { display: false } },
      y: { display: false }
    }
  };
}

function truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

function renderIssuesList() {
  const el = document.getElementById('issues-list');
  if (analysis.issues.length === 0) {
    el.innerHTML = `<div class="no-issues">No issues found — this file is clean.</div>`;
    return;
  }
  el.innerHTML = analysis.issues.map((issue, idx) => `
    <div class="issue-item sev-${issue.severity}" data-issue-idx="${idx}">
      <span class="issue-badge">${issue.severity === 'bad' ? 'FIX' : 'CHECK'}</span>
      <div class="issue-text">
        <div>${escapeHtml(issue.title)}</div>
        <div class="rows">${escapeHtml(issue.detail)}</div>
        <div class="rows">Rows: ${issue.rowIndices.slice(0, 12).map(i => i + 1).join(', ')}${issue.rowIndices.length > 12 ? `, +${issue.rowIndices.length - 12} more` : ''} — click to view</div>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.issue-item').forEach(node => {
    node.addEventListener('click', () => {
      const idx = Number(node.dataset.issueIdx);
      const issue = analysis.issues[idx];
      jumpToRow(issue.rowIndices[0]);
    });
  });
}

function renderTable() {
  const table = document.getElementById('data-table');
  const showFlaggedOnly = flaggedOnlyToggle.checked;
  const limit = 200;

  let rowsToShow = rawRows.map((r, i) => ({ r, i }));
  if (showFlaggedOnly) {
    rowsToShow = rowsToShow.filter(({ i }) => analysis.flaggedRowSet.has(i));
  }
  rowsToShow = rowsToShow.slice(0, limit);

  const thead = `<thead><tr><th>#</th>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const tbody = '<tbody>' + rowsToShow.map(({ r, i }) => {
    const flagged = analysis.flaggedRowSet.has(i);
    const cells = headers.map(h => {
      const v = r[h];
      if (isEmpty(v)) return `<td class="cell-empty">—</td>`;
      return `<td>${escapeHtml(v.toString())}</td>`;
    }).join('');
    return `<tr data-row-idx="${i}" class="${flagged ? 'flagged-row' : ''}"><td class="row-num">${i + 1}</td>${cells}</tr>`;
  }).join('') + '</tbody>';

  table.innerHTML = thead + tbody;
}

function jumpToRow(rowIndex) {
  flaggedOnlyToggle.checked = false;
  renderTable();
  requestAnimationFrame(() => {
    const rowEl = document.querySelector(`tr[data-row-idx="${rowIndex}"]`);
    if (rowEl) {
      rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      rowEl.classList.add('jump-highlight');
      setTimeout(() => rowEl.classList.remove('jump-highlight'), 1600);
    }
  });
}

function escapeHtml(s) {
  return s.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Download cleaned CSV ----------
function downloadCleanedCsv() {
  const seen = new Set();
  const cleanedRows = [];

  rawRows.forEach((row, i) => {
    if (analysis.blankRowIndices.includes(i)) return; // drop fully blank rows
    const key = headers.map(h => (row[h] ?? '').toString().trim().toLowerCase()).join('|');
    if (seen.has(key)) return; // drop duplicates (keep first occurrence)
    seen.add(key);

    const cleanedRow = {};
    headers.forEach(h => {
      let v = row[h];
      if (typeof v === 'string') v = v.trim();
      cleanedRow[h] = v ?? '';
    });
    cleanedRows.push(cleanedRow);
  });

  const csv = Papa.unparse(cleanedRows, { columns: headers });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const base = currentFileName.replace(/\.csv$/i, '');
  a.href = url;
  a.download = `${base}_cleaned.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Sample data generator ----------
function generateSampleCsv() {
  const firstNames = ['James', 'Mary', 'Kwame', 'Ama', 'David', 'Linda', 'Kofi', 'Akosua', 'Michael', 'Efua'];
  const lastNames = ['Smith', 'Owusu', 'Johnson', 'Mensah', 'Boateng', 'Davis', 'Asante', 'Osei'];
  const depts = ['Sales', 'Engineering', 'HR', 'Finance', 'Support', ''];
  const cities = ['Accra', 'Kumasi', 'ACCRA', 'Takoradi', 'Tamale'];
  const rows = [['employee_id', 'first_name', 'last_name', 'email', 'age', 'department', 'city', 'salary']];
  const seenRows = [];

  for (let i = 1; i <= 200; i++) {
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
    let age = 20 + Math.floor(Math.random() * 40);
    let salary = 2500 + Math.floor(Math.random() * 9000);
    let email = `${fn.toLowerCase()}.${ln.toLowerCase()}@company.com`;
    let dept = depts[Math.floor(Math.random() * depts.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];

    const roll = Math.random();
    if (roll < 0.06) age = '';
    else if (roll < 0.1) email = '';
    else if (roll < 0.13) salary = '';
    if (Math.random() < 0.03) age = 'N/A';
    if (Math.random() < 0.02) salary = 99999;

    const row = [`EMP${1000 + i}`, fn, ln, email, age, dept, city, salary];
    rows.push(row);
    seenRows.push(row);
  }
  for (let i = 0; i < 8; i++) {
    rows.push(seenRows[Math.floor(Math.random() * seenRows.length)]);
  }
  for (let i = 0; i < 3; i++) rows.push(['', '', '', '', '', '', '', '']);

  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}
JSEOF

echo "Done. Files created in ./datacheck"
echo "Open datacheck/index.html in your browser, or right-click it in VS Code and choose Open with Live Server."
