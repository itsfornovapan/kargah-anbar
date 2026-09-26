// Kargah Anbar - Cloud Configuration Extension
// This file adds cloud sync capabilities to the main app
// Load this AFTER the main index.html script

(function() {
  // Check if we're in cloud mode (API_BASE is set in index.html)
  const isCloudMode = () => typeof API_BASE !== 'undefined' && API_BASE !== null && API_BASE !== '';
  
  // Early exit if not in cloud mode
  if (!isCloudMode()) {
    console.log('Kargah Anbar: Running in offline mode');
    return;
  }
  
  console.log('Kargah Anbar: Running in cloud mode with API:', API_BASE);
  
  // =====================================================
  // CLOUD API FUNCTIONS
  // =====================================================
  async function apiFetch(endpoint, options = {}) {
    const baseUrl = API_BASE.endsWith('/') ? API_BASE : API_BASE + '/';
    const url = baseUrl + endpoint.replace(/^\//, '');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    
    try {
      const res = await fetch(url, { ...options, headers });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('API Fetch Error:', err);
      if (typeof state !== 'undefined' && state._cloudSync) {
        state._cloudSync.error = err.message;
      }
      return null;
    }
  }
  
  // Save data to cloud (full sync)
  async function saveToCloud() {
    if (!isCloudMode() || typeof state === 'undefined') return;
    
    state._cloudSync.loading = true;
    state._cloudSync.error = null;
    updateCloudIndicator('syncing');
    
    try {
      await Promise.all([
        syncTable('tools', state.tools),
        syncTable('sheets', state.sheets),
        syncTable('hardware', state.hardware),
        syncTable('templates', state.templates),
        syncTable('jobs', state.jobs)
      ]);
      
      state._cloudSync.lastSync = new Date().toISOString();
      state._cloudSync.loading = false;
      updateCloudIndicator('synced');
      if (typeof showToast !== 'undefined') showToast('داده‌ها در ابر همگام‌سازی شدند', 'ok');
    } catch (err) {
      state._cloudSync.loading = false;
      state._cloudSync.error = err.message;
      updateCloudIndicator('error');
      if (typeof showToast !== 'undefined') showToast('خطا در همگام‌سازی: ' + err.message, 'dan');
    }
  }
  
  async function syncTable(table, items) {
    await apiFetch(`api/${table}`, { method: 'DELETE' });
    
    for (const item of items) {
      await apiFetch(`api/${table}`, {
        method: 'POST',
        body: JSON.stringify(item)
      });
    }
  }
  
  // Load data from cloud
  async function loadFromCloud() {
    if (!isCloudMode() || typeof state === 'undefined') return false;
    
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
  
  // Override the original save function to also sync to cloud
  const originalSave = window.save;
  window.save = function() {
    if (originalSave) originalSave();
    saveToCloud().catch(console.error);
  };
  
  // Override the original load function to try cloud first
  const originalLoad = window.load;
  window.load = function() {
    if (typeof state !== 'undefined' && state._cloudSync) {
      loadFromCloud().then(success => {
        if (!success && originalLoad) {
          originalLoad();
        }
      }).catch(() => {
        if (originalLoad) originalLoad();
      });
    } else if (originalLoad) {
      originalLoad();
    }
  };
  
  // Override getInvoiceNumber to use cloud
  const originalGetInvoiceNumber = window.getInvoiceNumber;
  window.getInvoiceNumber = async function(templateId) {
    if (typeof originalGetInvoiceNumber === 'function') {
      return await getInvoiceNumberCloud(templateId);
    }
    return '001';
  };
  
  // Expose functions globally
  window.cloudSync = {
    saveToCloud,
    loadFromCloud,
    getInvoiceNumberCloud,
    updateCloudIndicator
  };
  
})();
