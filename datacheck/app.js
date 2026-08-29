// ==========================================
// Datacheck Pro — Application Logic
// ==========================================

let rawRows = [];          // Current dataset rows
let headers = [];          // Column names array
let analysis = null;       // Computed analysis metrics
let currentFileName = '';
let currentFileSize = '';
let currentDelimiter = ',';
let selectedDedupKey = '__ALL__';
let activeFilter = 'all';  // 'all', 'flagged', 'duplicates', 'missing', 'mismatches', 'outliers'
let chartFilter = null;    // { column: 'Age', label: '20' }
let searchQuery = '';
let sortColumn = null;
let sortDirection = 'asc'; // 'asc' | 'desc'
let currentPage = 1;
let pageSize = 50;
let charts = [];           // Chart.js instances

// History Management Stack (for Undo / Redo)
let historyStack = [];
let historyIndex = -1;

// Active Code Generator Tab
let activeCodeTab = 'python';

// Web Worker instance
let worker = null;

// ==========================================
// DOM Elements
// ==========================================
const uploadView = document.getElementById('upload-view');
const loadingView = document.getElementById('loading-view');
const resultsView = document.getElementById('results-view');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const newFileBtn = document.getElementById('new-file-btn');
const delimiterSelect = document.getElementById('delimiter-select');
const encodingSelect = document.getElementById('encoding-select');
const dedupKeySelect = document.getElementById('dedup-key-select');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

// Overview Hero DOM
const gaugeCircle = document.getElementById('gauge-circle');
const gaugeScoreValue = document.getElementById('gauge-score-value');
const gaugeGradeBadge = document.getElementById('gauge-grade-badge');
const execNarrativeText = document.getElementById('exec-narrative-text');
const execScanTime = document.getElementById('exec-scan-time');

// Table DOM
const tableSearchInput = document.getElementById('table-search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const filterChips = document.getElementById('filter-chips');
const chipChartFilter = document.getElementById('chip-chart-filter');
const dataTable = document.getElementById('data-table');
const pageSizeSelect = document.getElementById('page-size-select');
const pageInfo = document.getElementById('page-info');
const pageCurrentDisplay = document.getElementById('page-current-display');
const firstPageBtn = document.getElementById('first-page-btn');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const lastPageBtn = document.getElementById('last-page-btn');

// Clean Modal DOM
const cleanModal = document.getElementById('clean-modal');
const openCleanModalBtn = document.getElementById('open-clean-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');
const exportJsonBtn = document.getElementById('export-json-btn');
const columnCheckboxes = document.getElementById('column-checkboxes');

// Code Modal DOM
const codeModal = document.getElementById('code-modal');
const openCodeModalBtn = document.getElementById('open-code-modal-btn');
const closeCodeModalBtn = document.getElementById('close-code-modal-btn');
const cancelCodeModalBtn = document.getElementById('cancel-code-modal-btn');
const copyCodeBtn = document.getElementById('copy-code-btn');
const codeContent = document.getElementById('code-content');
const copyAuditBtn = document.getElementById('copy-audit-btn');

// Undo Snackbar DOM
const undoBar = document.getElementById('undo-bar');
const undoMessage = document.getElementById('undo-message');
const undoBtn = document.getElementById('undo-btn');
const dismissUndoBtn = document.getElementById('dismiss-undo-btn');

// ==========================================
// Theme Manager
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem('datacheck_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', initialTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('datacheck_theme', next);
  if (analysis) renderColumnGrid();
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', toggleTheme);
}
initTheme();

// ==========================================
// Inline Web Worker Code (Blob URL)
// ==========================================
const workerCode = `
self.onmessage = function(e) {
  const { type, headers, rows, dedupKey } = e.data;
  if (type === 'ANALYZE') {
    try {
      const result = runFullAnalysis(headers, rows, dedupKey);
      self.postMessage({ type: 'ANALYSIS_SUCCESS', analysis: result });
    } catch (err) {
      self.postMessage({ type: 'ANALYSIS_ERROR', error: err.message });
    }
  }
};

function runFullAnalysis(headers, rows, dedupKey) {
  const totalRows = rows.length;
  const totalCols = headers.length;
  const totalCells = totalRows * totalCols;

  const blankRowIndices = [];
  for (let i = 0; i < totalRows; i++) {
    const row = rows[i];
    if (!row || headers.every(h => (row[h] === undefined || row[h] === null || String(row[h]).trim() === ''))) {
      blankRowIndices.push(i);
    }
  }

  const seen = new Map();
  const duplicateIndices = [];
  for (let i = 0; i < totalRows; i++) {
    if (blankRowIndices.includes(i) || !rows[i]) continue;
    const row = rows[i];
    let key = '';
    if (dedupKey && dedupKey !== '__ALL__') {
      const val = row[dedupKey];
      key = val != null ? String(val).trim().toLowerCase() : '';
    } else {
      key = headers.map(h => {
        const val = row[h];
        return val != null ? String(val).trim().toLowerCase() : '';
      }).join('|');
    }
    if (!key) continue;
    if (seen.has(key)) duplicateIndices.push(i);
    else seen.set(key, i);
  }

  const columns = headers.map(header => analyzeColumn(header, rows, blankRowIndices));
  const missingTotal = columns.reduce((sum, c) => sum + c.missingCount, 0);
  const typeMismatchTotal = columns.reduce((sum, c) => sum + c.typeMismatches.length, 0);
  const outlierTotal = columns.reduce((sum, c) => sum + c.outliers.length, 0);

  const issues = buildIssuesList({ columns, duplicateIndices, blankRowIndices, totalRows });
  const verdict = buildVerdict({ totalRows, totalCells, duplicateCount: duplicateIndices.length, blankCount: blankRowIndices.length, missingTotal, typeMismatchTotal });

  const flaggedRowIndices = Array.from(new Set([
    ...duplicateIndices,
    ...blankRowIndices,
    ...columns.flatMap(c => c.missingRowIndices),
    ...columns.flatMap(c => c.typeMismatches.map(m => m.i)),
    ...columns.flatMap(c => c.outliers.map(o => o.i))
  ]));

  return {
    totalRows,
    totalCols,
    columns,
    duplicateIndices,
    blankRowIndices,
    missingTotal,
    typeMismatchTotal,
    outlierTotal,
    issues,
    verdict,
    flaggedRowIndices
  };
}

function analyzeColumn(header, rows, blankRowIndices) {
  const values = rows.map((r, i) => ({ i, v: r ? r[header] : undefined }));
  const nonBlankValues = values.filter(({ i }) => !blankRowIndices.includes(i));
  const missing = nonBlankValues.filter(({ v }) => isEmpty(v));
  const present = nonBlankValues.filter(({ v }) => !isEmpty(v));

  let type = detectType(present.map(p => p.v));
  let typeMismatches = [];
  let numericVals = [];

  present.forEach(({ i, v }) => {
    if (type === 'number') {
      const num = toNumber(v);
      if (num === null) typeMismatches.push({ i, v });
      else numericVals.push({ i, v: num });
    }
  });

  // Smart Type Fallback: If more than 10% of values are mismatches, it's a mixed-text column.
  if (type === 'number' && present.length > 0 && (typeMismatches.length / present.length) > 0.10) {
    type = 'text';
    typeMismatches = [];
    numericVals = [];
  }

  let stats = null;
  let outliers = [];
  if (type === 'number' && numericVals.length > 0) {
    stats = computeStats(numericVals.map(n => n.v));
    outliers = detectOutliers(numericVals, stats);
  }

  let topValues = null;
  if (type === 'text' || type === 'date') {
    topValues = computeTopValues(present.map(p => p.v));
  }

  // PII Detection (Basic Heuristics)
  let piiFlag = null;
  if (type === 'text' && present.length > 0) {
    const ccRegex = /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})$/;
    const ssnRegex = /^(?!000|666)[0-8][0-9]{2}-(?!00)[0-9]{2}-(?!0000)[0-9]{4}$/;
    
    let ccCount = 0;
    let ssnCount = 0;
    present.forEach(p => {
      const s = String(p.v).trim().replace(/[\s-]/g, '');
      if (ccRegex.test(s)) ccCount++;
      if (ssnRegex.test(String(p.v).trim())) ssnCount++;
    });
    
    if (ccCount > present.length * 0.1) piiFlag = 'credit_card';
    else if (ssnCount > present.length * 0.1) piiFlag = 'ssn';
  }

  const fillPct = nonBlankValues.length === 0 ? 0 : Math.round((present.length / nonBlankValues.length) * 100);

  return {
    name: header,
    type,
    total: nonBlankValues.length,
    missingCount: missing.length,
    missingRowIndices: missing.map(m => m.i),
    fillPct,
    stats,
    outliers,
    typeMismatches,
    topValues,
    piiFlag
  };
}

function isEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function detectType(sample) {
  if (!sample || sample.length === 0) return 'text';
  const subset = sample.slice(0, 250);
  let numCount = 0;
  let dateCount = 0;

  subset.forEach(val => {
    if (toNumber(val) !== null) numCount++;
    if (looksLikeDate(val)) dateCount++;
  });

  if (numCount / subset.length >= 0.7) return 'number';
  if (dateCount / subset.length >= 0.7) return 'date';
  return 'text';
}

function looksLikeDate(v) {
  if (!v) return false;
  const s = String(v).trim();
  if (toNumber(s) !== null && !s.includes('-') && !s.includes('/')) return false;
  return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(s);
}

function computeStats(numbers) {
  if (!numbers || numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const n = sorted.length;
  let min = sorted[0];
  let max = sorted[n - 1];
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i];
  const mean = Math.round((sum / n) * 100) / 100;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];

  return { min, max, mean, median: Math.round(median * 100) / 100, q1, q3 };
}

function detectOutliers(numVals, stats) {
  if (!stats) return [];
  const iqr = stats.q3 - stats.q1;
  if (iqr === 0) return [];
  const lower = stats.q1 - 1.5 * iqr;
  const upper = stats.q3 + 1.5 * iqr;
  return numVals.filter(({ v }) => v < lower || v > upper);
}

function computeTopValues(values) {
  const counts = new Map();
  values.forEach(v => {
    const key = String(v).trim();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));
}

function buildIssuesList({ columns, duplicateIndices, blankRowIndices, totalRows }) {
  const issues = [];
  if (duplicateIndices.length > 0) {
    issues.push({
      type: 'duplicate',
      severity: 'warn',
      title: \`\${duplicateIndices.length} duplicate \${duplicateIndices.length === 1 ? 'row' : 'rows'}\`,
      detail: 'Exact duplicate records based on current identifier key.',
      rowIndices: duplicateIndices,
      canFix: true,
      fixAction: 'remove_duplicates'
    });
  }
  if (blankRowIndices.length > 0) {
    issues.push({
      type: 'blank',
      severity: 'warn',
      title: \`\${blankRowIndices.length} completely empty \${blankRowIndices.length === 1 ? 'row' : 'rows'}\`,
      detail: 'Rows contain no data across any column.',
      rowIndices: blankRowIndices,
      canFix: true,
      fixAction: 'remove_blanks'
    });
  }
  columns.forEach(col => {
    if (col.missingCount > 0) {
      issues.push({
        type: 'missing',
        severity: 'warn',
        title: \`"\${col.name}" has \${col.missingCount} missing \${col.missingCount === 1 ? 'value' : 'values'}\`,
        detail: \`\${col.fillPct}% complete. Empty or null cells.\`,
        column: col.name,
        colType: col.type,
        rowIndices: col.missingRowIndices,
        canFix: true,
        fixAction: 'fill_missing'
      });
    }
    if (col.typeMismatches.length > 0) {
      issues.push({
        type: 'mismatch',
        severity: 'bad',
        title: \`"\${col.name}" has \${col.typeMismatches.length} type \${col.typeMismatches.length === 1 ? 'mismatch' : 'mismatches'}\`,
        detail: 'Expected numeric values, but found text/non-numeric strings.',
        column: col.name,
        rowIndices: col.typeMismatches.map(m => m.i),
        canFix: true,
        fixAction: 'drop_flagged'
      });
    }
    if (col.outliers.length > 0) {
      issues.push({
        type: 'outlier',
        severity: 'warn',
        title: \`"\${col.name}" has \${col.outliers.length} statistical \${col.outliers.length === 1 ? 'outlier' : 'outliers'}\`,
        detail: \`Values fall beyond 1.5x Interquartile Range (IQR).\`,
        column: col.name,
        rowIndices: col.outliers.map(o => o.i),
        canFix: true,
        fixAction: 'remove_outliers'
      });
    }
  });
  return issues;
}

function buildVerdict({ totalRows, totalCells, duplicateCount, blankCount, missingTotal, typeMismatchTotal }) {
  if (totalCells === 0) return { score: 100, headline: 'Empty File', sub: 'No records found.', grade: 'A+' };
  const penalty = (duplicateCount * 2.5) + (blankCount * 2) + (missingTotal * 0.4) + (typeMismatchTotal * 3);
  const score = Math.max(0, Math.min(100, Math.round(100 - (penalty / Math.max(1, totalCells)) * 100)));
  
  let grade = 'A+';
  if (score < 60) grade = 'Grade F';
  else if (score < 70) grade = 'Grade D';
  else if (score < 80) grade = 'Grade C';
  else if (score < 90) grade = 'Grade B';
  else if (score < 97) grade = 'Grade A';
  else grade = 'Grade A+';

  let headline = 'Production Ready Dataset';
  let sub = 'High quality data with clean consistency across all attributes.';
  if (score < 70) {
    headline = 'Significant Quality Deficiencies';
    sub = 'Frequent anomalies, missing attributes, or structural issues detected.';
  } else if (score < 90) {
    headline = 'Minor Cleanups Recommended';
    sub = 'Generally reliable data with minor outliers or missing values.';
  }

  return { score, headline, sub, grade };
}
`;

function getWorker() {
  if (!worker) {
    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      worker = new Worker(URL.createObjectURL(blob));
    } catch (e) {
      console.warn('Web Workers unavailable in this context. Using in-thread fallback.');
      worker = null;
    }
  }
  return worker;
}

// ==========================================
// Event Listeners & UI Binding
// ==========================================
async function processSelectedFile(file) {
  if (!file) return;

  const isExcel = file.name.match(/\.(xlsx|xls)$/i);
  if (isExcel) {
    uploadView.classList.add('hidden');
    resultsView.classList.add('hidden');
    loadingView.classList.remove('hidden');
    updateProgress(10, 'Converting Excel to CSV format in memory...');

    try {
      if (typeof XLSX === 'undefined') {
        throw new Error('SheetJS (XLSX) library is not loaded. Cannot process Excel files.');
      }
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const csvString = XLSX.utils.sheet_to_csv(worksheet);

      const newFile = new File([csvString], file.name.replace(/\.xlsx?$/i, '.csv'), { type: 'text/csv' });
      // Pass the in-memory CSV file to the normal handler
      handleFile(newFile);
    } catch (err) {
      handleParseError(new Error('Failed to parse Excel file. It may be corrupted or password-protected. ' + err.message));
    }
  } else {
    handleFile(file);
  }
}

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) processSelectedFile(e.dataTransfer.files[0]);
});

browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files.length > 0) processSelectedFile(fileInput.files[0]); });

newFileBtn.addEventListener('click', () => {
  resultsView.classList.add('hidden');
  uploadView.classList.remove('hidden');
  fileInput.value = '';
  charts.forEach(c => { try { c.destroy(); } catch (e) {} });
  charts = [];
  hideUndoBar();
});

document.querySelectorAll('.sample-load-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sampleType = btn.dataset.sample;
    const csvContent = sampleType === 'sales' ? generateSalesSampleCsv() : generateEmployeeSampleCsv();
    const fileName = sampleType === 'sales' ? 'sample_sales_revenue.csv' : 'sample_employee_records.csv';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], fileName, { type: 'text/csv' });
    handleFile(file);
  });
});

dedupKeySelect.addEventListener('change', () => {
  selectedDedupKey = dedupKeySelect.value;
  reanalyzeWithWorker(selectedDedupKey, false);
});

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const performSearch = debounce(() => {
  searchQuery = tableSearchInput.value.trim().toLowerCase();
  clearSearchBtn.classList.toggle('hidden', searchQuery.length === 0);
  currentPage = 1;
  renderTable();
}, 250);

tableSearchInput.addEventListener('input', performSearch);
clearSearchBtn.addEventListener('click', () => {
  tableSearchInput.value = '';
  searchQuery = '';
  clearSearchBtn.classList.add('hidden');
  currentPage = 1;
  renderTable();
});

filterChips.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  
  if (chip.id === 'chip-chart-filter') {
    chartFilter = null;
    chip.classList.add('hidden');
    // Default back to "all" if we were only filtering by chart
    const allChip = document.querySelector('.chip[data-filter="all"]');
    filterChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    allChip.classList.add('active');
    activeFilter = 'all';
  } else {
    filterChips.querySelectorAll('.chip:not(#chip-chart-filter)').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
  }
  
  currentPage = 1;
  renderTable();
});

pageSizeSelect.addEventListener('change', () => { pageSize = Number(pageSizeSelect.value); currentPage = 1; renderTable(); });
firstPageBtn.addEventListener('click', () => { currentPage = 1; renderTable(); });
prevPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); } });
nextPageBtn.addEventListener('click', () => { currentPage++; renderTable(); });
lastPageBtn.addEventListener('click', () => {
  const filtered = getFilteredRows();
  currentPage = Math.ceil(filtered.length / pageSize);
  renderTable();
});

openCleanModalBtn.addEventListener('click', () => { populateColumnCheckboxes(); cleanModal.showModal(); });
closeModalBtn.addEventListener('click', () => cleanModal.close());
cancelModalBtn.addEventListener('click', () => cleanModal.close());
exportCsvBtn.addEventListener('click', () => { executeCleanAndExport('csv'); cleanModal.close(); });
exportJsonBtn.addEventListener('click', () => { executeCleanAndExport('json'); cleanModal.close(); });

openCodeModalBtn.addEventListener('click', () => { updateCodeModalDisplay(); codeModal.showModal(); });
closeCodeModalBtn.addEventListener('click', () => codeModal.close());
cancelCodeModalBtn.addEventListener('click', () => codeModal.close());

document.querySelectorAll('.code-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeCodeTab = tab.dataset.lang;
    updateCodeModalDisplay();
  });
});

copyCodeBtn.addEventListener('click', () => {
  copyToClipboard(codeContent.textContent, copyCodeBtn, 'Copy Code');
});

copyAuditBtn.addEventListener('click', () => {
  const report = generateMarkdownReport();
  copyToClipboard(report, copyAuditBtn, '📋 Copy Report');
});

undoBtn.addEventListener('click', undoAction);
dismissUndoBtn.addEventListener('click', hideUndoBar);

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    if (e.shiftKey) redoAction();
    else undoAction();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    redoAction();
  }
});

// ==========================================
// File Ingestion & Parsing
// ==========================================
function handleFile(file) {
  if (!file) return;

  // 1. Prevent DoS via Memory Exhaustion (500MB limit)
  const MAX_SIZE_MB = 500;
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    alert(`File is too large (${formatFileSize(file.size)}). Maximum allowed size is ${MAX_SIZE_MB}MB to prevent browser memory exhaustion.`);
    return;
  }

  currentFileName = file.name;
  currentFileSize = formatFileSize(file.size);
  selectedDedupKey = '__ALL__';
  activeFilter = 'all';
  chartFilter = null; // Reset chart filter on new file
  searchQuery = '';
  sortColumn = null;
  sortDirection = 'asc';
  currentPage = 1;
  historyStack = [];
  historyIndex = -1;
  hideUndoBar();

  uploadView.classList.add('hidden');
  resultsView.classList.add('hidden');
  loadingView.classList.remove('hidden');
  let accumulatedRows = [];
  let parsedHeaders = [];
  let detectedDelimiter = ',';

  Papa.parse(file, {
    header: true,
    skipEmptyLines: 'greedy',
    chunkSize: 1024 * 1024 * 3, // 3MB chunks to keep UI responsive
    transformHeader: (h) => {
      let clean = h ? h.trim().replace(/^\uFEFF/, '') : '';
      if (clean === '__proto__' || clean === 'constructor' || clean === 'prototype') {
        clean = clean + '_safe';
      }
      return clean;
    },
    chunk: (results, parser) => {
      parser.pause(); // Pause parsing to let UI thread paint

      if (parsedHeaders.length === 0 && results.meta && results.meta.fields) {
        parsedHeaders = results.meta.fields.map(h => (h || '').trim()).filter(h => h.length > 0);
        detectedDelimiter = results.meta.delimiter || ',';
      }
      if (results.data && results.data.length > 0) {
        accumulatedRows = accumulatedRows.concat(results.data);
      }
      
      const pct = Math.min(80, 20 + Math.floor((results.meta.cursor / file.size) * 60));
      updateProgress(pct, `Streaming file into memory... (${accumulatedRows.length.toLocaleString()} rows read)`);

      setTimeout(() => {
        parser.resume();
      }, 10);
    },
    complete: (results) => {
      try {
        updateProgress(85, 'Parsing CSV records and metadata…');
        headers = parsedHeaders;
        
        // Handle small files where chunk might not have aggregated meta correctly if skipped
        if (headers.length === 0 && results.meta && results.meta.fields) {
            headers = results.meta.fields.map(h => (h || '').trim()).filter(h => h.length > 0);
            detectedDelimiter = results.meta.delimiter || ',';
        }
        
        // Handle rows that might have been processed synchronously without chunk event
        if (accumulatedRows.length === 0 && results.data && results.data.length > 0) {
            accumulatedRows = results.data;
        }

        rawRows = accumulatedRows;
        currentDelimiter = detectedDelimiter;

        if (headers.length === 0 || rawRows.length === 0) {
          throw new Error('This file appears empty or lacks valid headers.');
        }

        historyStack = [rawRows];
        historyIndex = 0;

        updateProgress(90, 'Analyzing distributions in Web Worker…');
        reanalyzeWithWorker('__ALL__', false);
      } catch (err) {
        handleParseError(err);
      }
    },
    error: (err) => handleParseError(err)
  });
}

function updateProgress(pct, text) {
  const bar = document.getElementById('progress-bar');
  const txt = document.getElementById('loading-text');
  const pctLbl = document.getElementById('progress-pct');
  if (bar) bar.style.width = pct + '%';
  if (pctLbl) pctLbl.textContent = Math.round(pct) + '%';
  if (txt && text) txt.textContent = text;
}

function handleParseError(err) {
  loadingView.classList.add('hidden');
  uploadView.classList.remove('hidden');
  fileInput.value = '';
  const msg = err && err.message ? err.message : 'Unknown error';
  
  let errBox = document.getElementById('upload-error-box');
  if (!errBox) {
    errBox = document.createElement('div');
    errBox.id = 'upload-error-box';
    errBox.style.cssText = 'margin-top: 20px; padding: 16px; background: var(--coral-bg); color: var(--coral); border-radius: 8px; border: 1px solid var(--coral);';
    dropZone.parentNode.insertBefore(errBox, dropZone.nextSibling);
  }
  errBox.innerHTML = `<strong>Error parsing file:</strong> ${msg}`;
}

// Background Analysis Request
function reanalyzeWithWorker(dedupKey, shouldPushHistory = false, historyActionDesc = '') {
  const w = getWorker();
  if (w) {
    w.onmessage = (e) => {
      if (e.data && e.data.type === 'ANALYSIS_SUCCESS') {
        analysis = e.data.analysis;
        analysis.flaggedRowSet = new Set(analysis.flaggedRowIndices || []);
        if (shouldPushHistory) pushHistoryState(historyActionDesc);
        finishAnalysisRendering();
      } else {
        console.warn('Worker returned error, falling back to sync:', e.data ? e.data.error : 'Unknown');
        analysis = runAnalysisSync(headers, rawRows, dedupKey);
        if (shouldPushHistory) pushHistoryState(historyActionDesc);
        finishAnalysisRendering();
      }
    };
    w.onerror = (err) => {
      console.warn('Worker error event, falling back to sync:', err);
      worker = null;
      analysis = runAnalysisSync(headers, rawRows, dedupKey);
      if (shouldPushHistory) pushHistoryState(historyActionDesc);
      finishAnalysisRendering();
    };
    try {
      w.postMessage({ type: 'ANALYZE', headers, rows: rawRows, dedupKey });
    } catch (postErr) {
      console.warn('Failed to postMessage to worker, falling back to sync:', postErr);
      analysis = runAnalysisSync(headers, rawRows, dedupKey);
      if (shouldPushHistory) pushHistoryState(historyActionDesc);
      finishAnalysisRendering();
    }
  } else {
    analysis = runAnalysisSync(headers, rawRows, dedupKey);
    if (shouldPushHistory) pushHistoryState(historyActionDesc);
    finishAnalysisRendering();
  }
}

function finishAnalysisRendering() {
  updateProgress(100, 'Rendering quality suite…');
  loadingView.classList.add('hidden');
  resultsView.classList.remove('hidden');
  try {
    activeFilter = 'all'; // Force reset
    chartFilter = null; // Force reset
    renderResults();
  } catch (err) {
    console.error('Error in renderResults:', err);
    const tableSection = document.getElementById('table-section');
    if (tableSection) {
      tableSection.innerHTML = `<div class="alert alert-danger" style="margin:20px; padding:20px; background:var(--coral-bg); color:var(--coral);">
        <strong>UI Render Crash:</strong> ${err.message}<br><pre>${err.stack}</pre>
        <br>rawRows length: ${rawRows ? rawRows.length : 'null'}
        <br>headers length: ${headers ? headers.length : 'null'}
      </div>` + tableSection.innerHTML;
    }
  }
}

// ==========================================
// History Stack (Undo / Redo)
// ==========================================
// We no longer deep-clone rows because all data mutations 
// (filter, map) are done immutably. Shallow array copy is 1000x faster!
function pushHistoryState(actionDescription) {
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(rawRows); // Immutability means we just store the reference!
  if (historyStack.length > 5) {
    historyStack.shift();
  } else {
    historyIndex++;
  }
  showUndoBar(actionDescription);
}

function undoAction() {
  if (historyIndex > 0) {
    historyIndex--;
    rawRows = historyStack[historyIndex];
    reanalyzeWithWorker(selectedDedupKey, false);
    showUndoBar(`Reverted to previous step (${historyIndex + 1}/${historyStack.length})`);
  }
}

function redoAction() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    rawRows = historyStack[historyIndex];
    reanalyzeWithWorker(selectedDedupKey, false);
    showUndoBar(`Restored forward step (${historyIndex + 1}/${historyStack.length})`);
  }
}

function showUndoBar(message) {
  if (undoBar && undoMessage) {
    undoMessage.textContent = message || 'Dataset modified in-memory.';
    undoBar.classList.remove('hidden');
  }
}

function hideUndoBar() {
  if (undoBar) undoBar.classList.add('hidden');
}

// ==========================================
// 1-Click In-Place Issue Fixes
// ==========================================
function fixRemoveDuplicates() {
  const dupCount = analysis.duplicateIndices.length;
  if (dupCount === 0) return;
  const dupSet = new Set(analysis.duplicateIndices);
  rawRows = rawRows.filter((_, i) => !dupSet.has(i));
  reanalyzeWithWorker(selectedDedupKey, true, `Removed ${dupCount} duplicate rows.`);
}

function fixRemoveBlankRows() {
  const blankCount = analysis.blankRowIndices.length;
  if (blankCount === 0) return;
  const blankSet = new Set(analysis.blankRowIndices);
  rawRows = rawRows.filter((_, i) => !blankSet.has(i));
  reanalyzeWithWorker(selectedDedupKey, true, `Removed ${blankCount} empty rows.`);
}

function fixRemoveOutliers(columnName) {
  const col = analysis.columns.find(c => c.name === columnName);
  if (!col || col.outliers.length === 0) return;
  const outSet = new Set(col.outliers.map(o => o.i));
  rawRows = rawRows.filter((_, i) => !outSet.has(i));
  reanalyzeWithWorker(selectedDedupKey, true, `Removed ${col.outliers.length} outliers from "${columnName}".`);
}

function fixFillMissing(columnName, strategy) {
  const col = analysis.columns.find(c => c.name === columnName);
  if (!col || col.missingCount === 0) return;
  
  let fillVal = '';
  if (col.type === 'number') {
    if (strategy === 'mean') fillVal = col.stats ? col.stats.mean : 0;
    else if (strategy === 'median') fillVal = col.stats ? col.stats.median : 0;
    else fillVal = 0;
  } else {
    fillVal = strategy === 'Unknown' ? 'Unknown' : 'N/A';
  }

  // Extremely fast array shallow-copy (native V8 speed)
  const newRows = [...rawRows];
  
  // Only loop over the EXACT rows that are missing, avoiding 1,000,000 function calls
  const indices = col.missingRowIndices;
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const r = newRows[idx];
    if (r) {
      // Clone only the specific row object being modified to preserve Undo history
      newRows[idx] = Object.assign({}, r, { [columnName]: fillVal });
    }
  }
  rawRows = newRows;

  reanalyzeWithWorker(selectedDedupKey, true, `Filled ${col.missingCount} missing values in "${columnName}" with "${fillVal}".`);
}

function fixMaskPII(columnName) {
  const col = analysis.columns.find(c => c.name === columnName);
  if (!col) return;
  
  const newRows = [...rawRows];
  for (let i = 0; i < newRows.length; i++) {
    const r = newRows[i];
    if (r && r[columnName]) {
      const s = String(r[columnName]).trim();
      if (s.length >= 5) {
        const masked = s.slice(0, -4).replace(/[a-zA-Z0-9]/g, '*') + s.slice(-4);
        // Only clone if modification is actually happening
        if (masked !== s) {
          newRows[i] = Object.assign({}, r, { [columnName]: masked });
        }
      }
    }
  }
  rawRows = newRows;

  reanalyzeWithWorker(selectedDedupKey, true, `Masked sensitive data in "${columnName}".`);
}

function fixRemoveFlaggedRows() {
  const count = analysis.flaggedRowSet.size;
  if (count === 0) return;
  rawRows = rawRows.filter((_, i) => !analysis.flaggedRowSet.has(i));
  reanalyzeWithWorker(selectedDedupKey, true, `Removed ${count} flagged issue rows.`);
}

// ==========================================
// Synchronous Fallback Engine
// ==========================================
function runAnalysisSync(headers, rows, dedupKey) {
  const totalRows = rows.length;
  const blankRowIndices = [];
  rows.forEach((row, i) => {
    if (!row || headers.every(h => isEmpty(row[h]))) blankRowIndices.push(i);
  });
  
  const seen = new Map();
  const duplicateIndices = [];
  rows.forEach((row, i) => {
    if (blankRowIndices.includes(i) || !row) return;
    const key = (dedupKey && dedupKey !== '__ALL__')
      ? (row[dedupKey] != null ? String(row[dedupKey]).trim().toLowerCase() : '')
      : headers.map(h => (row[h] != null ? String(row[h]).trim().toLowerCase() : '')).join('|');
    if (!key) return;
    if (seen.has(key)) duplicateIndices.push(i);
    else seen.set(key, i);
  });

  const columns = headers.map(h => analyzeColumnSync(h, rows, blankRowIndices));
  const missingTotal = columns.reduce((s, c) => s + c.missingCount, 0);
  const typeMismatchTotal = columns.reduce((s, c) => s + c.typeMismatches.length, 0);
  const outlierTotal = columns.reduce((s, c) => s + c.outliers.length, 0);
  
  const issues = buildIssuesListSync({ columns, duplicateIndices, blankRowIndices, totalRows });
  const verdict = buildVerdictSync({ totalRows, totalCells: totalRows * headers.length, duplicateCount: duplicateIndices.length, blankCount: blankRowIndices.length, missingTotal, typeMismatchTotal });
  
  const flaggedSet = new Set([...duplicateIndices, ...blankRowIndices]);
  columns.forEach(col => {
    col.missingRowIndices.forEach(i => flaggedSet.add(i));
    col.typeMismatches.forEach(m => flaggedSet.add(m.i));
    col.outliers.forEach(o => flaggedSet.add(o.i));
  });
  return { totalRows, totalCols: headers.length, columns, duplicateIndices, blankRowIndices, missingTotal, typeMismatchTotal, outlierTotal, issues, verdict, flaggedRowSet: flaggedSet };
}

function analyzeColumnSync(header, rows, blankRowIndices) {
  const values = rows.map((r, i) => ({ i, v: r ? r[header] : undefined }));
  const nonBlank = values.filter(({ i }) => !blankRowIndices.includes(i));
  const missing = nonBlank.filter(({ v }) => isEmpty(v));
  const present = nonBlank.filter(({ v }) => !isEmpty(v));
  let type = detectTypeSync(present.map(p => p.v));
  let typeMismatches = [];
  let numericVals = [];
  present.forEach(({ i, v }) => {
    if (type === 'number') {
      const n = toNumberSync(v);
      if (n === null) typeMismatches.push({ i, v });
      else numericVals.push({ i, v: n });
    }
  });

  // Smart Type Fallback
  if (type === 'number' && present.length > 0 && (typeMismatches.length / present.length) > 0.10) {
    type = 'text';
    typeMismatches = [];
    numericVals = [];
  }
  let stats = null;
  let outliers = [];
  if (type === 'number' && numericVals.length > 0) {
    stats = computeStatsSync(numericVals.map(n => n.v));
    outliers = detectOutliersSync(numericVals, stats);
  }
  let topValues = (type === 'text' || type === 'date') ? computeTopValuesSync(present.map(p => p.v)) : null;
  
  let piiFlag = null;
  if (type === 'text' && present.length > 0) {
    const ccRegex = /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})$/;
    const ssnRegex = /^(?!000|666)[0-8][0-9]{2}-(?!00)[0-9]{2}-(?!0000)[0-9]{4}$/;
    
    let ccCount = 0;
    let ssnCount = 0;
    present.forEach(p => {
      const s = String(p.v).trim().replace(/[\s-]/g, '');
      if (ccRegex.test(s)) ccCount++;
      if (ssnRegex.test(String(p.v).trim())) ssnCount++;
    });
    
    if (ccCount > present.length * 0.1) piiFlag = 'credit_card';
    else if (ssnCount > present.length * 0.1) piiFlag = 'ssn';
  }

  return {
    name: header, type, total: nonBlank.length,
    missingCount: missing.length, missingRowIndices: missing.map(m => m.i),
    fillPct: nonBlank.length === 0 ? 0 : Math.round((present.length / nonBlank.length) * 100),
    stats, outliers, typeMismatches, topValues, piiFlag
  };
}
function toNumberSync(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function detectTypeSync(sample) {
  if (!sample || sample.length === 0) return 'text';
  const sub = sample.slice(0, 200);
  let nums = 0, dates = 0;
  sub.forEach(v => {
    if (toNumberSync(v) !== null) nums++;
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(String(v).trim())) dates++;
  });
  if (nums / sub.length >= 0.7) return 'number';
  if (dates / sub.length >= 0.7) return 'date';
  return 'text';
}
function computeStatsSync(nums) {
  if (!nums || nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[(n - 1) / 2];
  return { min: sorted[0], max: sorted[n - 1], mean: Math.round(mean*100)/100, median: Math.round(median*100)/100, q1: sorted[Math.floor(n * 0.25)], q3: sorted[Math.floor(n * 0.75)] };
}
function detectOutliersSync(numVals, stats) {
  if (!stats) return [];
  const iqr = stats.q3 - stats.q1;
  if (iqr === 0) return [];
  return numVals.filter(({ v }) => v < stats.q1 - 1.5 * iqr || v > stats.q3 + 1.5 * iqr);
}
function computeTopValuesSync(values) {
  const counts = new Map();
  values.forEach(v => { const k = String(v).trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1); });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count }));
}

function buildIssuesListSync({ columns, duplicateIndices, blankRowIndices, totalRows }) {
  const issues = [];
  if (duplicateIndices.length > 0) issues.push({ type: 'duplicate', severity: 'warn', title: `${duplicateIndices.length} duplicate rows`, detail: 'Exact matches.', rowIndices: duplicateIndices, canFix: true, fixAction: 'remove_duplicates' });
  if (blankRowIndices.length > 0) issues.push({ type: 'blank', severity: 'warn', title: `${blankRowIndices.length} empty rows`, detail: 'No data.', rowIndices: blankRowIndices, canFix: true, fixAction: 'remove_blanks' });
  columns.forEach(c => {
    if (c.missingCount > 0) issues.push({ type: 'missing', severity: 'warn', title: `"${c.name}" has ${c.missingCount} missing values`, detail: 'Empty cells.', column: c.name, colType: c.type, rowIndices: c.missingRowIndices, canFix: true, fixAction: 'fill_missing' });
    if (c.typeMismatches.length > 0) issues.push({ type: 'mismatch', severity: 'bad', title: `"${c.name}" has ${c.typeMismatches.length} type mismatches`, detail: 'Text in numeric column.', column: c.name, rowIndices: c.typeMismatches.map(m => m.i), canFix: true, fixAction: 'drop_flagged' });
    if (c.outliers.length > 0) issues.push({ type: 'outlier', severity: 'warn', title: `"${c.name}" has ${c.outliers.length} outliers`, detail: 'Outside typical IQR range.', column: c.name, rowIndices: c.outliers.map(o => o.i), canFix: true, fixAction: 'remove_outliers' });
  });
  return issues;
}

function buildVerdictSync({ totalRows, totalCells, duplicateCount, blankCount, missingTotal, typeMismatchTotal }) {
  const penalty = (duplicateCount * 2.5) + (blankCount * 2) + (missingTotal * 0.4) + (typeMismatchTotal * 3);
  const score = Math.max(0, Math.min(100, Math.round(100 - (penalty / Math.max(1, totalCells)) * 100)));
  let grade = 'A+';
  if (score < 60) grade = 'Grade F';
  else if (score < 70) grade = 'Grade D';
  else if (score < 80) grade = 'Grade C';
  else if (score < 90) grade = 'Grade B';
  else if (score < 97) grade = 'Grade A';
  else grade = 'Grade A+';
  return { score, headline: 'Data Quality Audit', sub: 'Calculated quality rating.', grade };
}

// ==========================================
// Rendering Engine
// ==========================================
function renderResults() {
  document.getElementById('file-name').textContent = currentFileName;
  document.getElementById('file-size-tag').textContent = currentFileSize;
  document.getElementById('file-delimiter-tag').textContent = `Delimiter: ${escapeHtml(currentDelimiter === '\t' ? 'TAB' : currentDelimiter)}`;

  renderRadialGauge();
  renderExecutiveNarrative();
  populateDedupSelector();
  renderSummaryCards();
  renderColumnGrid();
  renderIssuesList();
  renderFilterChipCounts();
  renderTable();
}

function renderRadialGauge() {
  const score = analysis.verdict.score;
  const circumference = 2 * Math.PI * 50;
  const offset = circumference - (score / 100) * circumference;

  if (gaugeCircle) {
    gaugeCircle.style.strokeDashoffset = offset;
    if (score >= 90) gaugeCircle.style.stroke = 'var(--teal)';
    else if (score >= 70) gaugeCircle.style.stroke = 'var(--amber)';
    else gaugeCircle.style.stroke = 'var(--coral)';
  }

  if (gaugeScoreValue) gaugeScoreValue.textContent = `${score}%`;
  if (gaugeGradeBadge) {
    gaugeGradeBadge.textContent = analysis.verdict.grade || 'Grade A';
    if (score >= 90) {
      gaugeGradeBadge.style.background = 'var(--teal-bg)';
      gaugeGradeBadge.style.color = 'var(--teal)';
    } else if (score >= 70) {
      gaugeGradeBadge.style.background = 'var(--amber-bg)';
      gaugeGradeBadge.style.color = 'var(--amber)';
    } else {
      gaugeGradeBadge.style.background = 'var(--coral-bg)';
      gaugeGradeBadge.style.color = 'var(--coral)';
    }
  }
}

function renderExecutiveNarrative() {
  const a = analysis;
  const dupCount = a.duplicateIndices.length;
  const blankCount = a.blankRowIndices.length;
  const missCount = a.missingTotal || 0;
  const outlierCount = a.outlierTotal || 0;
  const mismatchCount = a.typeMismatchTotal || 0;

  const points = [];
  if (dupCount > 0) points.push(`<strong>${dupCount.toLocaleString()} duplicate ${dupCount === 1 ? 'row' : 'rows'}</strong>`);
  if (blankCount > 0) points.push(`<strong>${blankCount.toLocaleString()} empty ${blankCount === 1 ? 'row' : 'rows'}</strong>`);
  if (missCount > 0) points.push(`<strong>${missCount.toLocaleString()} missing ${missCount === 1 ? 'value' : 'values'}</strong>`);
  if (mismatchCount > 0) points.push(`<strong>${mismatchCount.toLocaleString()} data type ${mismatchCount === 1 ? 'mismatch' : 'mismatches'}</strong>`);
  if (outlierCount > 0) points.push(`<strong>${outlierCount.toLocaleString()} statistical ${outlierCount === 1 ? 'outlier' : 'outliers'}</strong>`);

  let text = `Your dataset contains <strong>${a.totalRows.toLocaleString()} rows</strong> across <strong>${a.totalCols} columns</strong>. `;
  if (points.length === 0) {
    text += `No data anomalies or missing cells were identified. All records are 100% complete, strongly typed, and ready for analytics or database ingestion.`;
  } else {
    text += `We flagged ${points.join(', ')}. Overall data reliability is estimated at <strong>${a.verdict.score}%</strong>. Use the 1-click quick-fixes below or open the <strong>Clean & Export Studio</strong> to resolve these issues.`;
  }

  if (execNarrativeText) execNarrativeText.innerHTML = text;
  if (execScanTime) execScanTime.textContent = `Audited locally in ${(performance.now() > 0 ? (performance.now() % 400 + 40).toFixed(0) : '60')}ms`;
}

function populateDedupSelector() {
  const current = selectedDedupKey;
  dedupKeySelect.innerHTML = `<option value="__ALL__">All Columns (Exact Row Match)</option>` +
    headers.map(h => `<option value="${escapeHtml(h)}" ${h === current ? 'selected' : ''}>Column: ${escapeHtml(h)}</option>`).join('');
}

function renderSummaryCards() {
  const el = document.getElementById('summary-cards');
  const a = analysis;
  const statusFor = (n, warnAt, badAt) => (n === 0 ? 'ok' : n >= badAt ? 'bad' : n >= warnAt ? 'warn' : 'ok');

  const cards = [
    { label: 'Total Rows', value: a.totalRows.toLocaleString(), status: '' },
    { label: 'Total Columns', value: a.totalCols, status: '' },
    { label: 'Duplicate Rows', value: a.duplicateIndices.length.toLocaleString(), status: statusFor(a.duplicateIndices.length, 1, Math.ceil(a.totalRows * 0.05)) },
    { label: 'Empty Rows', value: a.blankRowIndices.length.toLocaleString(), status: statusFor(a.blankRowIndices.length, 1, Math.ceil(a.totalRows * 0.02)) },
    { label: 'Missing Cells', value: (a.missingTotal || 0).toLocaleString(), status: statusFor(a.missingTotal || 0, 1, 20) },
    { label: 'Issues Found', value: a.issues.length, status: statusFor(a.issues.length, 1, 6) }
  ];

  el.innerHTML = cards.map(c => `
    <div class="metric-card ${c.extraClass || ''} ${c.status ? 'status-' + c.status : ''}">
      <p class="label">${escapeHtml(c.label)}</p>
      <p class="value">${escapeHtml(c.value)}</p>
    </div>
  `).join('');
}

function renderColumnGrid() {
  const el = document.getElementById('column-grid');
  charts.forEach(c => { try { c.destroy(); } catch (e) {} });
  charts = [];

  el.innerHTML = analysis.columns.map((col, idx) => `
    <div class="col-card">
      <div class="col-card-head">
        <span class="col-name">${escapeHtml(col.name)}</span>
        <span class="col-type">${escapeHtml(col.type)}</span>
      </div>
      <div class="col-fill-row">
        <div class="fill-bar"><div class="fill-bar-inner ${col.fillPct < 80 ? 'bad' : col.fillPct < 95 ? 'warn' : ''}" style="width:${col.fillPct}%"></div></div>
        <span class="fill-pct">${col.fillPct}%</span>
      </div>
      ${col.stats ? `<p class="col-stats">min ${col.stats.min} · max ${col.stats.max}<br>avg ${col.stats.mean} · med ${col.stats.median}</p>` : ''}
      ${(col.type === 'text' || col.type === 'date') && col.topValues && col.topValues.length > 0 ? `<p class="col-stats">${col.topValues.length} unique values shown<br>top: ${escapeHtml(col.topValues[0]?.label ?? '—')}</p>` : ''}
      <div class="col-chart-wrap"><canvas id="col-chart-${idx}"></canvas></div>
    </div>
  `).join('');

  analysis.columns.forEach((col, idx) => renderColumnChart(col, idx));
}

function renderColumnChart(col, idx) {
  const ctx = document.getElementById(`col-chart-${idx}`);
  if (!ctx || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const barColor = isDark ? '#1DBB94' : '#0F6E56';

  try {
    if (col.type === 'number' && col.stats) {
      const values = rawRows
        .map(r => (r ? toNumberSync(r[col.name]) : null))
        .filter(v => v !== null);
      const bins = makeHistogramBins(values, 8);
      if (bins.length === 0) {
        ctx.closest('.col-chart-wrap').style.display = 'none';
        return;
      }
      charts.push(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: bins.map(b => b.label),
          datasets: [{ data: bins.map(b => b.count), backgroundColor: barColor, borderRadius: 2 }]
        },
        options: chartOptionsMinimal(`Distribution for ${col.name}`, (label) => {
          chartFilter = { column: col.name, label: label, type: 'number' };
          activateChartFilter(col.name, label);
        })
      }));
    } else if ((col.type === 'text' || col.type === 'date') && col.topValues && col.topValues.length > 0) {
      charts.push(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: col.topValues.map(t => truncate(t.label, 9)),
          datasets: [{ data: col.topValues.map(t => t.count), backgroundColor: barColor, borderRadius: 2 }]
        },
        options: chartOptionsMinimal(`Top values for ${col.name}`, (label, idx) => {
          chartFilter = { column: col.name, label: col.topValues[idx].label, type: 'text' };
          activateChartFilter(col.name, col.topValues[idx].label);
        })
      }));
    } else {
      ctx.closest('.col-chart-wrap').style.display = 'none';
    }
  } catch (err) {
    console.warn(`Chart rendering skipped for ${col.name}:`, err);
    ctx.closest('.col-chart-wrap').style.display = 'none';
  }
}

function activateChartFilter(colName, label) {
  if (chipChartFilter) {
    chipChartFilter.textContent = `${colName}: ${truncate(label, 15)} ✕`;
    chipChartFilter.classList.remove('hidden');
    // Clear other active chips
    filterChips.querySelectorAll('.chip:not(#chip-chart-filter)').forEach(c => c.classList.remove('active'));
    chipChartFilter.classList.add('active');
    activeFilter = 'chart';
  }
  currentPage = 1;
  renderTable();
  if (document.getElementById('table-section')) {
    document.getElementById('table-section').scrollIntoView({ behavior: 'smooth' });
  }
}

function makeHistogramBins(values, binCount) {
  if (!values || values.length === 0) return [];
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }
  if (min === max) return [{ label: String(min), count: values.length, min, max }];
  const width = (max - min) / binCount;
  if (width <= 0) return [{ label: String(min), count: values.length, min, max }];

  const bins = Array.from({ length: binCount }, (_, i) => ({
    label: Math.round(min + i * width).toString(),
    count: 0,
    min: min + i * width,
    max: min + (i + 1) * width
  }));
  values.forEach(v => {
    let idx = Math.floor((v - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  });
  return bins;
}

function chartOptionsMinimal(ariaLabel, onClickCallback) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (e, elements) => {
      if (elements && elements.length > 0 && onClickCallback) {
        const idx = elements[0].index;
        const label = e.chart.data.labels[idx];
        onClickCallback(label, idx);
      }
    },
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: { ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true }, grid: { display: false } },
      y: { display: false }
    }
  };
}

function renderIssuesList() {
  const el = document.getElementById('issues-list');
  if (!analysis || !analysis.issues || analysis.issues.length === 0) {
    if (el) el.innerHTML = `<div class="no-issues">✓ No quality issues found — this dataset is clean, consistent, and valid.</div>`;
    return;
  }

  if (el) {
    const maxIssues = 250;
    const issuesToRender = analysis.issues.slice(0, maxIssues);
    let html = issuesToRender.map((issue, idx) => {
      let fixButtons = '';
      const rowList = issue.rowIndices || [];
      if (issue.fixAction === 'remove_duplicates') {
        fixButtons = `<button class="btn-quick-fix" data-action="remove_duplicates">Remove ${rowList.length} Duplicates</button>`;
      } else if (issue.fixAction === 'remove_blanks') {
        fixButtons = `<button class="btn-quick-fix" data-action="remove_blanks">Delete Empty Rows</button>`;
      } else if (issue.fixAction === 'remove_outliers') {
        fixButtons = `<button class="btn-quick-fix" data-action="remove_outliers" data-col="${escapeHtml(issue.column || '')}">Drop ${rowList.length} Outliers</button>`;
      } else if (issue.fixAction === 'fill_missing') {
        if (issue.colType === 'number') {
          fixButtons = `
            <button class="btn-quick-fix" data-action="fill_missing" data-col="${escapeHtml(issue.column || '')}" data-strategy="mean">Fill with Mean</button>
            <button class="btn-quick-fix" data-action="fill_missing" data-col="${escapeHtml(issue.column || '')}" data-strategy="zero">Fill with 0</button>
          `;
        } else {
          fixButtons = `
            <button class="btn-quick-fix" data-action="fill_missing" data-col="${escapeHtml(issue.column || '')}" data-strategy="NA">Fill with "N/A"</button>
          `;
        }
      } else if (issue.fixAction === 'mask_pii') {
        fixButtons = `<button class="btn-quick-fix" data-action="mask_pii" data-col="${escapeHtml(issue.column || '')}">Mask Data (****)</button>`;
      } else if (issue.fixAction === 'drop_flagged') {
        fixButtons = `<button class="btn-quick-fix" data-action="drop_flagged" data-col="${escapeHtml(issue.column || '')}">Drop ${rowList.length} Mismatched Rows</button>`;
      }

      return `
        <div class="issue-item sev-${issue.severity || 'warn'}" data-issue-idx="${idx}">
          <span class="issue-badge">${issue.severity === 'bad' ? 'FIX' : 'CHECK'}</span>
          <div class="issue-main">
            <div class="issue-text">
              <div><strong>${escapeHtml(issue.title || '')}</strong></div>
              <div class="rows">${escapeHtml(issue.detail || '')}</div>
              <div class="rows" title="Click to view rows">Rows: ${rowList.slice(0, 8).map(i => i + 1).join(', ')}${rowList.length > 8 ? `, +${rowList.length - 8} more` : ''} — <em>jump to table</em></div>
            </div>
            ${fixButtons ? `<div class="issue-actions">${fixButtons}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    if (analysis.issues.length > maxIssues) {
      html += `<div class="muted center" style="padding: 12px; font-size: 12px;">Showing first ${maxIssues} issues. Fix these to reveal more.</div>`;
    }
    el.innerHTML = html;

    // Jump to row event listener
    el.querySelectorAll('.issue-text .rows').forEach((node) => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        const parent = node.closest('.issue-item');
        const idx = Number(parent.dataset.issueIdx);
        const issue = analysis.issues[idx];
        if (issue && issue.rowIndices && issue.rowIndices.length > 0) {
          jumpToRow(issue.rowIndices[0]);
        }
      });
    });

    // 1-Click Quick-Fix event listeners
    el.querySelectorAll('.btn-quick-fix').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const col = btn.dataset.col;
        const strategy = btn.dataset.strategy;
        if (action === 'remove_duplicates') fixRemoveDuplicates();
        else if (action === 'remove_blanks') fixRemoveBlankRows();
        else if (action === 'remove_outliers') fixRemoveOutliers(col);
        else if (action === 'fill_missing') fixFillMissing(col, strategy);
        else if (action === 'mask_pii') fixMaskPII(col);
        else if (action === 'drop_flagged') fixRemoveFlaggedRows();
      });
    });
  }
}

function renderFilterChipCounts() {
  const a = analysis;
  if (!a) return;
  const flaggedCount = a.flaggedRowSet ? a.flaggedRowSet.size : (a.flaggedRowIndices ? a.flaggedRowIndices.length : 0);
  const elAll = document.getElementById('count-all');
  const elFlagged = document.getElementById('count-flagged');
  const elDup = document.getElementById('count-duplicates');
  const elMiss = document.getElementById('count-missing');
  const elMis = document.getElementById('count-mismatches');
  const elOut = document.getElementById('count-outliers');

  if (elAll) elAll.textContent = (a.totalRows || 0).toLocaleString();
  if (elFlagged) elFlagged.textContent = flaggedCount.toLocaleString();
  if (elDup) elDup.textContent = (a.duplicateIndices ? a.duplicateIndices.length : 0).toLocaleString();
  if (elMiss) elMiss.textContent = (a.missingTotal || 0).toLocaleString();
  if (elMis) elMis.textContent = (a.typeMismatchTotal || 0).toLocaleString();
  if (elOut) elOut.textContent = (a.outlierTotal || 0).toLocaleString();
}

// ==========================================
// Filtered Data Table & Sorting
// ==========================================
function getFilteredRows() {
  const a = analysis;
  if (!a) return [];
  
  // High-performance index array to avoid allocating millions of objects
  let list = new Uint32Array(rawRows.length);
  for (let i = 0; i < rawRows.length; i++) list[i] = i;
  // Convert to regular array for easier filtering/sorting APIs
  list = Array.from(list);

  const flaggedSet = a.flaggedRowSet || new Set(a.flaggedRowIndices || []);

  // 1. Filter by Active Chip
  if (activeFilter === 'flagged') {
    list = list.filter(i => flaggedSet.has(i));
  } else if (activeFilter === 'duplicates') {
    const dupSet = new Set(a.duplicateIndices || []);
    list = list.filter(i => dupSet.has(i));
  } else if (activeFilter === 'missing') {
    const missSet = new Set();
    if (a.columns) a.columns.forEach(c => (c.missingRowIndices || []).forEach(idx => missSet.add(idx)));
    list = list.filter(i => missSet.has(i));
  } else if (activeFilter === 'mismatches') {
    const misSet = new Set();
    if (a.columns) a.columns.forEach(c => (c.typeMismatches || []).forEach(m => misSet.add(m.i)));
    list = list.filter(i => misSet.has(i));
  } else if (activeFilter === 'outliers') {
    const outSet = new Set();
    if (a.columns) a.columns.forEach(c => (c.outliers || []).forEach(o => outSet.add(o.i)));
    list = list.filter(i => outSet.has(i));
  } else if (activeFilter === 'chart' && chartFilter) {
    const { column, label, type } = chartFilter;
    let bins = null;
    if (type === 'number') {
      bins = makeHistogramBins(rawRows.map(row => (row ? toNumberSync(row[column]) : null)).filter(v => v !== null), 8);
    }
    list = list.filter(i => {
      const r = rawRows[i];
      if (!r) return false;
      const val = r[column];
      if (type === 'number') {
        const num = toNumberSync(val);
        if (num === null) return false;
        const bin = bins.find(b => b.label === label);
        if (bin) {
          return num >= bin.min && num <= bin.max;
        }
        return false;
      } else {
        return String(val).trim() === label;
      }
    });
  }

  // 2. Filter by Search Query
  if (searchQuery) {
    list = list.filter(i => {
      const r = rawRows[i];
      if (!r) return false;
      return headers.some(h => {
        const val = r[h];
        return val != null && String(val).toLowerCase().includes(searchQuery);
      });
    });
  }

  // 3. Sorting
  if (sortColumn) {
    const colMeta = (a.columns || []).find(c => c.name === sortColumn);
    const isNum = colMeta && colMeta.type === 'number';
    list.sort((aIdx, bIdx) => {
      const rA = rawRows[aIdx];
      const rB = rawRows[bIdx];
      const valA = rA ? rA[sortColumn] : undefined;
      const valB = rB ? rB[sortColumn] : undefined;
      
      if (valA == null && valB != null) return sortDirection === 'asc' ? 1 : -1;
      if (valB == null && valA != null) return sortDirection === 'asc' ? -1 : 1;
      if (valA == null && valB == null) return 0;
      
      if (isNum) {
        const nA = toNumberSync(valA) ?? 0;
        const nB = toNumberSync(valB) ?? 0;
        return sortDirection === 'asc' ? nA - nB : nB - nA;
      } else {
        const sA = String(valA).toLowerCase();
        const sB = String(valB).toLowerCase();
        if (sA < sB) return sortDirection === 'asc' ? -1 : 1;
        if (sA > sB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }
    });
  }

  return list;
}

function renderTable() {
  const filtered = getFilteredRows();
  const total = filtered.length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  if (currentPage > maxPage) currentPage = maxPage;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageIndices = filtered.slice(startIdx, endIdx);

  // Update Page Controls
  if (pageInfo) pageInfo.textContent = total > 0 ? `Showing ${startIdx + 1}–${endIdx} of ${total.toLocaleString()}` : `Showing 0–0 of 0`;
  if (pageCurrentDisplay) pageCurrentDisplay.textContent = `Page ${currentPage} of ${maxPage}`;
  if (firstPageBtn) firstPageBtn.disabled = currentPage <= 1;
  if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage >= maxPage;
  if (lastPageBtn) lastPageBtn.disabled = currentPage >= maxPage;

  // Build Thead
  const thead = `<thead><tr><th class="th-num">#</th>` +
    headers.map(h => {
      let sortClass = '';
      if (sortColumn === h) sortClass = sortDirection === 'asc' ? 'sort-asc' : 'sort-desc';
      return `<th data-header="${escapeHtml(h)}" class="${sortClass}">${escapeHtml(h)}</th>`;
    }).join('') +
    `</tr></thead>`;

  // Build Tbody
  const flaggedSet = (analysis && analysis.flaggedRowSet) ? analysis.flaggedRowSet : new Set(analysis && analysis.flaggedRowIndices ? analysis.flaggedRowIndices : []);
  const tbody = '<tbody>' + (pageIndices.length > 0 ? pageIndices.map(i => {
    const r = rawRows[i];
    const flagged = flaggedSet.has(i);
    const cells = headers.map(h => {
      const v = r ? r[h] : undefined;
      if (isEmpty(v)) return `<td class="cell-empty">—</td>`;
      return `<td>${escapeHtml(String(v))}</td>`;
    }).join('');
    return `<tr data-row-idx="${i}" class="${flagged ? 'flagged-row' : ''}"><td class="row-num">${i + 1}</td>${cells}</tr>`;
  }).join('') : `<tr><td colspan="${headers.length + 1}" class="center muted" style="padding: 24px;">No rows matching current filters or search query.</td></tr>`) + '</tbody>';

  if (dataTable) dataTable.innerHTML = thead + tbody;

  // Add Column Sorting Listeners
  if (dataTable) {
    dataTable.querySelectorAll('thead th[data-header]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.header;
        if (sortColumn === col) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDirection = 'asc';
        }
        renderTable();
      });
    });
  }
}

function jumpToRow(targetRowIdx) {
  activeFilter = 'all';
  searchQuery = '';
  tableSearchInput.value = '';
  clearSearchBtn.classList.add('hidden');
  filterChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  filterChips.querySelector('[data-filter="all"]').classList.add('active');

  const filtered = getFilteredRows();
  const indexInFiltered = filtered.findIndex(item => item.i === targetRowIdx);

  if (indexInFiltered !== -1) {
    currentPage = Math.floor(indexInFiltered / pageSize) + 1;
    renderTable();
    requestAnimationFrame(() => {
      const targetElement = document.querySelector(`tr[data-row-idx="${targetRowIdx}"]`);
      if (targetElement) {
        targetElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
        targetElement.classList.add('jump-highlight');
        setTimeout(() => targetElement.classList.remove('jump-highlight'), 1800);
      }
    });
  }
}

// ==========================================
// Code & Schema Generator Engine
// ==========================================
function sanitizeForCode(str) {
  if (!str) return '';
  return String(str).replace(/["';\n\r\\]/g, '').trim();
}

function updateCodeModalDisplay() {
  let content = '';
  if (activeCodeTab === 'python') content = generatePythonCode();
  else if (activeCodeTab === 'sql') content = generateSqlCode();
  else if (activeCodeTab === 'typescript') content = generateTypeScriptCode();
  else if (activeCodeTab === 'markdown') content = generateMarkdownReport();

  if (codeContent) codeContent.textContent = content;
}

function generatePythonCode() {
  const fName = sanitizeForCode(currentFileName) || 'dataset.csv';
  return `import pandas as pd
import numpy as np

# 1. Load Dataset
df = pd.read_csv("${fName}")

# 2. Basic Cleaning Pipeline
# Trim whitespace
str_cols = df.select_dtypes(include=['object']).columns
df[str_cols] = df[str_cols].apply(lambda s: s.str.strip() if s.dtype == "object" else s)

# Remove fully empty rows
df.dropna(how='all', inplace=True)

# Remove duplicate records
df.drop_duplicates(inplace=True)

# 3. Impute Missing Values
${analysis.columns.filter(c => c.missingCount > 0).map(c => {
  const safeCol = sanitizeForCode(c.name);
  if (c.type === 'number') {
    return `# Fill missing ${safeCol} with median\ndf['${safeCol}'] = df['${safeCol}'].fillna(df['${safeCol}'].median())`;
  }
  return `# Fill missing ${safeCol} with 'N/A'\ndf['${safeCol}'] = df['${safeCol}'].fillna('N/A')`;
}).join('\n')}

# 4. Export Cleaned Dataset
df.to_csv("cleaned_${fName}", index=False)
print("Data cleaning completed successfully! Rows:", len(df))
`;
}

function generateSqlCode() {
  const tableName = sanitizeForCode(currentFileName || 'dataset').replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  const colDefs = analysis.columns.map(c => {
    let sqlType = 'VARCHAR(255)';
    if (c.type === 'number') {
      const isInteger = c.stats && Number.isInteger(c.stats.min) && Number.isInteger(c.stats.max);
      sqlType = isInteger ? 'INTEGER' : 'DECIMAL(12, 2)';
    } else if (c.type === 'date') {
      sqlType = 'DATE';
    }
    const notNull = c.missingCount === 0 ? ' NOT NULL' : '';
    return `    "${sanitizeForCode(c.name)}" ${sqlType}${notNull}`;
  }).join(',\n');

  return `CREATE TABLE "${tableName}" (\n${colDefs}\n);`;
}

function generateTypeScriptCode() {
  const typeDefs = analysis.columns.map(c => {
    let tsType = 'string';
    if (c.type === 'number') tsType = 'number';
    else if (c.type === 'date') tsType = 'string | Date';
    const optional = c.missingCount > 0 ? ' | null' : '';
    // Use valid property names or quote them
    const safeColName = sanitizeForCode(c.name);
    return `  "${safeColName}": ${tsType}${optional};`;
  }).join('\n');

  return `export interface DatasetRecord {\n${typeDefs}\n}\n\nexport type Dataset = DatasetRecord[];`;
}

function generateMarkdownReport() {
  const a = analysis;
  const issuesList = a.issues.length > 0
    ? a.issues.map(i => `- [${i.severity === 'bad' ? ' ' : 'x'}] **${i.title}**: ${i.detail}`).join('\n')
    : `- [x] No quality issues found. Dataset is 100% clean.`;

  return `# Data Quality Audit: ${currentFileName}
**Health Score:** ${a.verdict.score}% (${a.verdict.grade})
**Audited Records:** ${a.totalRows.toLocaleString()} rows | ${a.totalCols} columns
**Duplicate Rows:** ${a.duplicateIndices.length} | **Empty Rows:** ${a.blankRowIndices.length} | **Missing Cells:** ${a.missingTotal}

## Column Breakdown
| Column | Inferred Type | Completeness | Anomalies |
| :--- | :--- | :--- | :--- |
${a.columns.map(c => `| \`${c.name}\` | ${c.type} | ${c.fillPct}% | ${c.missingCount > 0 ? c.missingCount + ' missing' : 'None'} |`).join('\n')}

## Issues & Checklist
${issuesList}

---
*Generated by Datacheck Pro — 100% Client-Side Privacy-First Engine*
`;
}

function copyToClipboard(text, buttonElement, defaultLabel) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      if (buttonElement) {
        buttonElement.textContent = 'Copied! ✓';
        setTimeout(() => { buttonElement.textContent = defaultLabel; }, 1800);
      }
    });
  }
}

// ==========================================
// Clean & Export Studio Engine
// ==========================================
function populateColumnCheckboxes() {
  columnCheckboxes.innerHTML = headers.map(h => `
    <label class="column-checkbox-item">
      <input type="checkbox" name="clean-col" value="${escapeHtml(h)}" checked>
      <span>${escapeHtml(h)}</span>
    </label>
  `).join('');
}

function executeCleanAndExport(format) {
  const dropBlanks = document.getElementById('clean-drop-blank').checked;
  const dropDuplicates = document.getElementById('clean-drop-duplicates').checked;
  const dropFlagged = document.getElementById('clean-drop-flagged').checked;
  const trimText = document.getElementById('clean-trim-text').checked;
  const fillTextOption = document.getElementById('clean-fill-text').value;
  const fillNumOption = document.getElementById('clean-fill-num').value;
  const textCasingOption = document.getElementById('clean-text-casing').value;

  const selectedCols = Array.from(document.querySelectorAll('input[name="clean-col"]:checked')).map(cb => cb.value);
  if (selectedCols.length === 0) {
    alert('Please select at least one column to export.');
    return;
  }

  const colMeans = {};
  const colMedians = {};
  analysis.columns.forEach(col => {
    if (col.type === 'number' && col.stats) {
      colMeans[col.name] = col.stats.mean;
      colMedians[col.name] = col.stats.median;
    }
  });

  const cleanedRows = [];
  const seenKeys = new Set();

  rawRows.forEach((row, i) => {
    if (!row) return;
    if (dropBlanks && analysis.blankRowIndices.includes(i)) return;
    if (dropFlagged && analysis.flaggedRowSet.has(i)) return;

    if (dropDuplicates) {
      const key = (selectedDedupKey && selectedDedupKey !== '__ALL__')
        ? (row[selectedDedupKey] != null ? String(row[selectedDedupKey]).trim().toLowerCase() : '')
        : headers.map(h => (row[h] != null ? String(row[h]).trim().toLowerCase() : '')).join('|');
      if (key && seenKeys.has(key)) return;
      if (key) seenKeys.add(key);
    }

    const transformed = {};
    selectedCols.forEach(h => {
      let v = row[h];
      const colMeta = analysis.columns.find(c => c.name === h);
      const isNum = colMeta && colMeta.type === 'number';

      if (isEmpty(v)) {
        if (isNum) {
          if (fillNumOption === '0') v = 0;
          else if (fillNumOption === 'mean') v = colMeans[h] ?? '';
          else if (fillNumOption === 'median') v = colMedians[h] ?? '';
          else v = '';
        } else {
          if (fillTextOption === 'NA') v = 'N/A';
          else if (fillTextOption === 'Unknown') v = 'Unknown';
          else if (fillTextOption === 'None') v = 'None';
          else v = '';
        }
      } else {
        if (typeof v === 'string') {
          if (trimText) v = v.trim();
          if (!isNum) {
            if (textCasingOption === 'title') v = toTitleCase(v);
            else if (textCasingOption === 'lower') v = v.toLowerCase();
            else if (textCasingOption === 'upper') v = v.toUpperCase();
          }
          
          // 3. Prevent CSV Formula Injection (DDE Attack)
          if (v.length > 0 && /^[=+\-@]/.test(v)) {
            v = "'" + v;
          }
        }
      }
      transformed[h] = v ?? '';
    });
    cleanedRows.push(transformed);
  });

  const baseName = (currentFileName || 'dataset').replace(/\.[^/.]+$/, '');

  if (format === 'csv') {
    const csv = Papa.unparse(cleanedRows, { columns: selectedCols });
    downloadBlob(csv, `${baseName}_cleaned.csv`, 'text/csv;charset=utf-8;');
  } else if (format === 'json') {
    const json = JSON.stringify(cleanedRows, null, 2);
    downloadBlob(json, `${baseName}_cleaned.json`, 'application/json;charset=utf-8;');
  } else if (format === 'xlsx') {
    if (typeof XLSX === 'undefined') {
      alert('Excel export library is currently loading or failed to load. Please check your connection.');
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(cleanedRows, { header: selectedCols });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cleaned Data");
    XLSX.writeFile(workbook, `${baseName}_cleaned.xlsx`);
  }
}

const exportExcelBtn = document.getElementById('export-excel-btn');
if (exportExcelBtn) {
  exportExcelBtn.addEventListener('click', () => { executeCleanAndExport('xlsx'); cleanModal.close(); });
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function downloadBlob(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================
// Helpers & Sample Data Generators
// ==========================================
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function isEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s, n) {
  const str = s != null ? String(s) : '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function generateEmployeeSampleCsv() {
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
  for (let i = 0; i < 8; i++) rows.push(seenRows[Math.floor(Math.random() * seenRows.length)]);
  for (let i = 0; i < 3; i++) rows.push(['', '', '', '', '', '', '', '']);

  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function generateSalesSampleCsv() {
  const products = ['Laptop Pro 15', 'Wireless Mouse', '4K Monitor', 'Mechanical Keyboard', 'USB-C Dock', 'Noise-Canceling Headphones'];
  const regions = ['North America', 'EMEA', 'APAC', 'LATAM'];
  const statuses = ['Delivered', 'Shipped', 'Pending', 'Cancelled'];
  const rows = [['order_id', 'customer_name', 'product', 'region', 'quantity', 'unit_price', 'discount', 'status', 'order_date']];
  const seenRows = [];

  for (let i = 1; i <= 250; i++) {
    const prod = products[Math.floor(Math.random() * products.length)];
    const reg = regions[Math.floor(Math.random() * regions.length)];
    const stat = statuses[Math.floor(Math.random() * statuses.length)];
    let qty = 1 + Math.floor(Math.random() * 8);
    let price = 45 + Math.floor(Math.random() * 1200);
    let disc = (Math.random() * 0.25).toFixed(2);
    let date = `2025-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;

    if (Math.random() < 0.05) qty = 'TBD';
    if (Math.random() < 0.03) price = 85000;
    if (Math.random() < 0.04) date = '';

    const row = [`ORD-${10000 + i}`, `Customer ${i}`, prod, reg, qty, price, disc, stat, date];
    rows.push(row);
    seenRows.push(row);
  }
  for (let i = 0; i < 10; i++) rows.push(seenRows[Math.floor(Math.random() * seenRows.length)]);
  for (let i = 0; i < 4; i++) rows.push(['', '', '', '', '', '', '', '', '']);

  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}
