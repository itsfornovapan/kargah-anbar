// Kargah Anbar - Cloud Configuration
// Uncomment and set API_BASE to enable cloud mode

// const API_BASE = 'https://kargah-anbar-api.your-subdomain.workers.dev';
// (Replace with your actual Cloudflare Worker URL after deployment)

const state = {
  tools: [], sheets: [], hardware: [], templates: [], jobs: [],
  ui: {
    tab:'dash',
    toolCat:null,
    sheetsCat:null, sheetsSub:null,
    hardwareCat:null, hardwareSub:null,
    showSheetSearch:false,
    openTemplate:null, openJob:null, jobFilter:'open'
  },
  wizard: null,
  pendingImport: null,
  importMode: 'merge',
  _cloudSync: { loading: false, error: null, lastSync: null }
};

const uid   = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-3);
const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num   = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g,'')); return isNaN(n) ? 0 : n; };
const fmt   = n => new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2}).format(num(n));
const fmtInt= n => new Intl.NumberFormat('fa-IR',{maximumFractionDigits:0}).format(num(n));
const faNow = () => new Date().toLocaleDateString('fa-IR');
const uniq  = arr => [...new Set(arr.filter(Boolean))];

// Check if we're in cloud mode
const isCloudMode = () => typeof API_BASE !== 'undefined' && API_BASE !== null && API_BASE !== '';

// =====================================================
// CLOUD API FUNCTIONS
// =====================================================
async function apiFetch(endpoint, options = {}) {
  if (!isCloudMode()) return null;
  
  const baseUrl = API_BASE.endsWith('/') ? API_BASE : API_BASE + '/';
  const url = baseUrl + endpoint.replace(/^\//, '');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  
  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('API Fetch Error:', err);
    state._cloudSync.error = err.message;
    return null;
  }
}

// Save data to cloud (full sync)
async function saveToCloud() {
  if (!isCloudMode()) return;
  
  state._cloudSync.loading = true;
  state._cloudSync.error = null;
  updateCloudIndicator('syncing');
  
  const payload = {
    tools: state.tools,
    sheets: state.sheets,
    hardware: state.hardware,
    templates: state.templates,
    jobs: state.jobs
  };
  
  try {
    await Promise.all([
      syncTable('tools', payload.tools),
      syncTable('sheets', payload.sheets),
      syncTable('hardware', payload.hardware),
      syncTable('templates', payload.templates),
      syncTable('jobs', payload.jobs)
    ]);
    
    state._cloudSync.lastSync = new Date().toISOString();
    state._cloudSync.loading = false;
    updateCloudIndicator('synced');
    showToast('داده‌ها در ابر همگام‌سازی شدند', 'ok');
  } catch (err) {
    state._cloudSync.loading = false;
    state._cloudSync.error = err.message;
    updateCloudIndicator('error');
    showToast('خطا در همگام‌سازی: ' + err.message, 'dan');
  }
}

async function syncTable(table, items) {
  // For simplicity, delete all and re-insert
  const clearResult = await apiFetch(`api/${table}`, { method: 'DELETE' });
  if (!clearResult) return;
  
  for (const item of items) {
    await apiFetch(`api/${table}`, {
      method: 'POST',
      body: JSON.stringify(item)
    });
  }
}

// Load data from cloud
async function loadFromCloud() {
  if (!isCloudMode()) return false;
  
  state._cloudSync.loading = true;
  state._cloudSync.error = null;
  updateCloudIndicator('syncing');
  
  try {
    const [tools, sheets, hardware, templates, jobs] = await Promise.all([
      apiFetch('api/tools'),
      apiFetch('api/sheets'),
      apiFetch('api/hardware'),
      apiFetch('api/templates'),
      apiFetch('api/jobs')
    ]);
    
    if (Array.isArray(tools)) state.tools = tools;
    if (Array.isArray(sheets)) state.sheets = sheets;
    if (Array.isArray(hardware)) state.hardware = hardware;
    if (Array.isArray(templates)) state.templates = templates;
    if (Array.isArray(jobs)) state.jobs = jobs;
    
    state._cloudSync.lastSync = new Date().toISOString();
    state._cloudSync.loading = false;
    updateCloudIndicator('synced');
    return true;
  } catch (err) {
    state._cloudSync.loading = false;
    state._cloudSync.error = err.message;
    updateCloudIndicator('error');
    return false;
  }
}

// Get next invoice number from cloud
async function getInvoiceNumberCloud(templateId) {
  if (!isCloudMode()) {
    // Local fallback
    const INV_COUNTER_KEY = 'kargah_inv_counter';
    let count = parseInt(localStorage.getItem(INV_COUNTER_KEY) || '0', 10);
    const prefix = 'inv_num_' + templateId.slice(0,8);
    const stored = localStorage.getItem(prefix);
    if (!stored) {
      count++;
      localStorage.setItem(INV_COUNTER_KEY, String(count));
      localStorage.setItem(prefix, String(count));
    }
    return String(count).padStart(3,'0');
  }
  
  try {
    const result = await apiFetch('api/invoice-number');
    return result?.number || '001';
  } catch (err) {
    console.error('Invoice number fetch failed:', err);
    return '001';
  }
}

// Update cloud indicator UI
function updateCloudIndicator(status) {
  const el = document.getElementById('cloud-sync-indicator');
  const icon = document.getElementById('cloud-status-icon');
  const text = document.getElementById('cloud-status-text');
  
  if (!el) return;
  
  if (!isCloudMode()) {
    el.classList.remove('cloud-active');
    return;
  }
  
  el.classList.add('cloud-active');
  el.className = 'cloud-active';
  
  switch(status) {
    case 'syncing':
      el.classList.add('syncing');
      icon.textContent = '⏳';
      text.textContent = 'در حال همگام‌سازی...';
      break;
    case 'synced':
      el.classList.add('synced');
      icon.textContent = '✓';
      text.textContent = 'همگام‌سازی شد';
      break;
    case 'error':
      el.classList.add('error');
      icon.textContent = '✗';
      text.textContent = 'خطا در اتصال';
      break;
    default:
      el.classList.add('synced');
      icon.textContent = '☁️';
      text.textContent = 'حالت ابری';
  }
}

// =====================================================
// LOCAL STORAGE FUNCTIONS (fallback/offline)
// =====================================================
const KEY = 'kargah_anbar_v8';
const THEME_KEY = 'kargah_theme';

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      tools: state.tools,
      sheets: state.sheets,
      hardware: state.hardware,
      templates: state.templates,
      jobs: state.jobs
    }));
    
    // Also sync to cloud if available
    if (isCloudMode()) {
      saveToCloud().catch(console.error);
    }
  } catch(e) { console.warn(e); }
}

function load() {
  try {
    if (isCloudMode()) {
      loadFromCloud().then(success => {
        if (!success) {
          loadFromLocalStorage();
        }
        render();
      }).catch(() => {
        loadFromLocalStorage();
        render();
      });
    } else {
      loadFromLocalStorage();
      render();
    }
  } catch(e) { 
    console.warn(e);
    render();
  }
}

function loadFromLocalStorage() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}');
    state.tools     = d.tools     || [];
    state.sheets    = d.sheets    || [];
    state.hardware  = d.hardware  || [];
    state.templates = d.templates || [];
    state.jobs      = d.jobs      || [];
  } catch(e) { console.warn(e); }
}
