// ==================== ESTADO E ARMAZENAMENTO ====================
const store = {
  articles: [], books: [], research: [],
  read: { articles: new Set(), books: new Set(), research: new Set() },
  currentTab: 'articles',
  db: null
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  return (url.trim().startsWith('http://') || url.trim().startsWith('https://')) ? url.trim() : '#';
}

function stableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
}

// ==================== UNIFICAÇÃO DO INDEXEDDB ====================
async function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ReadPlusDB', 14); // Nova versão limpa
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Mantemos apenas as tabelas essenciais de registros e log de leitura
      const stores = ['articles', 'books', 'research', 'reading_log'];
      stores.forEach(s => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      });
    };
    req.onsuccess = (e) => { store.db = e.target.result; resolve(); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveItemToDB(storeName, item) {
  const tx = store.db.transaction([storeName], 'readwrite');
  tx.objectStore(storeName).put(item);
}

async function toggleReadStatus(id, type, itemData) {
  const readSet = store.read[type];
  const tx = store.db.transaction(['reading_log', type], 'readwrite');
  
  if (readSet.has(id)) {
    readSet.delete(id);
    tx.objectStore('reading_log').delete(id);
  } else {
    readSet.add(id);
    tx.objectStore('reading_log').put({ id, type, date: new Date().toISOString(), title: itemData.title, url: itemData.url, authors: itemData.authors });
    tx.objectStore(type).put(itemData);
  }
  
  return new Promise(res => tx.oncomplete = () => res());
}

async function loadReadingLog() {
  return new Promise((resolve) => {
    const tx = store.db.transaction(['reading_log'], 'readonly');
    tx.objectStore('reading_log').getAll().onsuccess = (e) => {
      store.read.articles.clear(); store.read.books.clear(); store.read.research.clear();
      const logs = e.target.result || [];
      logs.forEach(log => {
        if (store.read[log.type]) store.read[log.type].add(log.id);
      });
      resolve(logs);
    };
  });
}

// ==================== MOTORES DE BUSCA INDEPENDENTES ====================
async function searchOpenAlex(query, isResearch = false) {
  let filter = 'open_access.is_oa:true';
  if (isResearch) filter += ',type:article,type:report';
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=${filter}&sort=relevance_score:desc&per-page=20`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).map(w => ({
      id: stableHash(w.id || w.title),
      title: w.title || 'Sem título',
      authors: w.authorships?.map(a => a.author.display_name) || ['Autor desconhecido'],
      abstract: w.abstract || (w.abstract_inverted_index ? Object.entries(w.abstract_inverted_index).sort((a,b)=>a[1][0]-b[1][0]).map(([w])=>w).join(' ') : 'Resumo indisponível'),
      url: w.open_access?.oa_url || w.best_oa_location?.pdf_url || '#',
      source: isResearch ? 'OpenAlex Research' : 'OpenAlex Articles'
    }));
  } catch (e) {
    console.error(e); return [];
  }
}

async function searchGoogleBooks(query) {
  const proxyUrl = 'https://corsproxy.io/?';
  const directUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&printType=books`;
  try {
    const res = await fetch(proxyUrl + encodeURIComponent(directUrl));
    const data = await res.json();
    if (data.items) {
      return data.items.map(item => ({
        id: item.id,
        title: item.volumeInfo.title || 'Sem título',
        authors: item.volumeInfo.authors || ['Autor não informado'],
        abstract: item.volumeInfo.description || 'Sinopse indisponível',
        url: item.volumeInfo.previewLink || item.volumeInfo.infoLink || '#',
        source: 'Google Books'
      }));
    }
    throw new Error();
  } catch {
    // Fallback limpo para OpenAlex se der CORS
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=type:book&per-page=20`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).map(w => ({
      id: stableHash(w.id || w.title),
      title: w.title || 'Sem título',
      authors: w.authorships?.map(a => a.author.display_name) || [],
      abstract: w.abstract || 'Sinopse indisponível',
      url: w.id,
      source: 'OpenAlex Books Fallback'
    }));
  }
}

// ==================== ENGINE DE VIRTUALIZAÇÃO NATIVA PERFEITA ====================
function renderVirtualGrid(container, items, type) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<div class="no-results">🔍 Nenhum resultado encontrado. Escreva algo acima e busque.</div>';
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('div');
    row.style.contentVisibility = 'auto';
    row.style.containIntrinsicSize = '140px';
    
    const isChecked = store.read[type].has(item.id);
    
    row.innerHTML = `
      <div class="result-card">
        <div class="checkbox ${isChecked ? 'checked' : ''}" data-id="${escapeHtml(item.id)}">${isChecked ? '✓' : ''}</div>
        <div class="card-content">
          <a href="${sanitizeUrl(item.url)}" target="_blank" class="card-title">${escapeHtml(item.title)}</a>
          <div class="card-meta">Por: ${escapeHtml(item.authors.join(', '))} | Fonte: ${escapeHtml(item.source)}</div>
          <div class="card-abstract">${escapeHtml(item.abstract)}</div>
        </div>
      </div>
    `;

    row.querySelector('.checkbox').addEventListener('click', async (e) => {
      await toggleReadStatus(item.id, type, item);
      e.target.classList.toggle('checked');
      e.target.textContent = e.target.classList.contains('checked') ? '✓' : '';
    });

    container.appendChild(row);
  });
}

// ==================== RENDERIZADOR DAS ABAS E INTERFACES ====================
function injectSearchInterface(placeholderText, searchAction) {
  const container = document.getElementById('mainContent');
  container.innerHTML = `
    <div class="search-area">
      <input type="text" id="queryInput" class="search-input" placeholder="${placeholderText}" aria-label="Campo de busca">
      <button id="executeSearchBtn" class="search-btn">Buscar</button>
    </div>
    <div class="results-grid" id="verticalGrid"></div>
  `;

  const input = document.getElementById('queryInput');
  const btn = document.getElementById('executeSearchBtn');
  const grid = document.getElementById('verticalGrid');

  grid.innerHTML = '<div class="no-results">Pronto para buscar registros...</div>';

  const triggerSearch = async () => {
    const q = input.value.trim();
    if (!q) return;
    btn.textContent = 'Buscando...';
    const results = await searchAction(q);
    store[store.currentTab] = results;
    renderVirtualGrid(grid, results, store.currentTab);
    btn.textContent = 'Buscar';
  };

  btn.addEventListener('click', triggerSearch);
  input.addEventListener('keypress', (e) => { if(e.key === 'Enter') triggerSearch(); });
}

async function renderSummaryTab() {
  const container = document.getElementById('mainContent');
  container.innerHTML = '<div class="no-results">Carregando histórico de leituras...</div>';
  
  const allLogs = await new Promise((resolve) => {
    const tx = store.db.transaction(['reading_log'], 'readonly');
    tx.objectStore('reading_log').getAll().onsuccess = (e) => resolve(e.target.result || []);
  });

  if(!allLogs.length) {
    container.innerHTML = '<div class="no-results">📚 Você ainda não marcou nenhum registro como lido.</div>';
    return;
  }

  container.innerHTML = `
    <div class="summary-section">
      <h3 class="summary-title">📄 Artigos Lidos</h3>
      <div class="results-grid" id="summary-articles"></div>
    </div>
    <div class="summary-section" style="margin-top:20px;">
      <h3 class="summary-title">📚 Livros Lidos</h3>
      <div class="results-grid" id="summary-books"></div>
    </div>
    <div class="summary-section" style="margin-top:20px;">
      <h3 class="summary-title">🔬 Pesquisas Lidas</h3>
      <div class="results-grid" id="summary-research"></div>
    </div>
  `;

  const types = { articles: 'summary-articles', books: 'summary-books', research: 'summary-research' };
  
  Object.keys(types).forEach(type => {
    const sectionGrid = document.getElementById(types[type]);
    const filteredLogs = allLogs.filter(l => l.type === type);
    
    if(!filteredLogs.length) {
      sectionGrid.innerHTML = '<div class="no-results" style="padding:15px;">Nenhum item marcado nesta categoria.</div>';
    } else {
      filteredLogs.forEach(item => {
        const row = document.createElement('div');
        row.innerHTML = `
          <div class="result-card" style="border-color: rgba(123,44,191,0.2)">
            <div class="card-content">
              <a href="${sanitizeUrl(item.url)}" target="_blank" class="card-title">${escapeHtml(item.title)}</a>
              <div class="card-meta">Por: ${escapeHtml(item.authors ? item.authors.join(', ') : 'Desconhecido')}</div>
            </div>
          </div>
        `;
        sectionGrid.appendChild(row);
      });
    }
  });
}

// ==================== INICIALIZADOR DE NAVEGAÇÃO ====================
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  await loadReadingLog();

  const tabs = document.querySelectorAll('.main-tab');
  
  const switchTab = (tab) => {
    tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    
    store.currentTab = tab.getAttribute('data-main');
    
    if (store.currentTab === 'articles') {
      injectSearchInterface('Buscar artigos científicos no OpenAlex...', async (q) => searchOpenAlex(q, false));
    } else if (store.currentTab === 'books') {
      injectSearchInterface('Buscar livros no Google Books...', searchGoogleBooks);
    } else if (store.currentTab === 'research') {
      injectSearchInterface('Buscar relatórios e pesquisas acadêmicas...', async (q) => searchOpenAlex(q, true));
    } else if (store.currentTab === 'summary') {
      renderSummaryTab();
    }
  };

  tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab)));
  
  // Forçar gatilho inicial na aba correta e limpa
  switchTab(tabs[0]);
});
