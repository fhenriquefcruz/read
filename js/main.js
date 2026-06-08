// ==================== ESTADO CENTRALIZADO ====================
const store = {
  articles: [], books: [], research: [],
  read: { article: new Set(), book: new Set(), research: new Set() },
  currentTab: 'articles',
  db: null
};

// ==================== SANITIZAÇÃO CONTRA XSS ====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;" }[m]));
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const t = url.trim();
  return (t.startsWith('http://') || t.startsWith('https://')) ? t : '#';
}

function stableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
}

// ==================== CONEXÃO INDEXEDDB ORIGINAL ====================
async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ReadPlusDB', 12); // Preservando estritamente a versão 12 original
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const stores = ['articles','books','research','notes','collections','tags','favorites','reading_log','study_log','radar','settings','zettels','backlinks'];
      stores.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'settings' ? 'key' : 'id' }); });
    };
    req.onsuccess = (e) => { store.db = e.target.result; resolve(e.target.result); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function markAsReadInDB(id, type, isRead) {
  const tx = store.db.transaction(['reading_log'], 'readwrite');
  if (isRead) {
    tx.objectStore('reading_log').put({ id, type, date: new Date().toISOString() });
    store.read[type].add(id);
  } else {
    tx.objectStore('reading_log').delete(id);
    store.read[type].delete(id);
  }
  return new Promise(res => tx.oncomplete = () => res());
}

async function loadInitialReadingLog() {
  return new Promise((resolve) => {
    const tx = store.db.transaction(['reading_log'], 'readonly');
    tx.objectStore('reading_log').getAll().onsuccess = (e) => {
      store.read.article.clear(); store.read.book.clear(); store.read.research.clear();
      const data = e.target.result || [];
      data.forEach(log => {
        if (store.read[log.type]) store.read[log.type].add(log.id);
      });
      resolve();
    };
  });
}

// ==================== APIS DE BUSCA ATUALIZADAS ====================
async function fetchOpenAlex(query, type = 'article') {
  let filter = 'open_access.is_oa:true';
  // CORREÇÃO PONTO 3: Ajustado o filtro para relatórios e teses de formato válido no OpenAlex
  if (type === 'research') filter += ',type:report|thesis';
  
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=${filter}&sort=relevance_score:desc&per-page=20`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(w => ({
      id: stableHash(w.id || w.title),
      title: w.title || 'Sem título',
      authors: w.authorships?.map(a => a.author.display_name) || ['Autor desconhecido'],
      abstract: w.abstract || (w.abstract_inverted_index ? Object.entries(w.abstract_inverted_index).sort((a,b)=>a[1][0]-b[1][0]).map(([w])=>w).join(' ') : 'Resumo e dados de análise indisponíveis para este registro.'),
      url: w.open_access?.oa_url || w.best_oa_location?.pdf_url || w.id,
      source: type === 'research' ? 'Pesquisa Institucional' : 'Artigo Científico'
    }));
  } catch (e) {
    console.error(e); return [];
  }
}

async function fetchBooks(query) {
  const proxyUrl = 'https://corsproxy.io/?';
  const directUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&printType=books`;
  try {
    const res = await fetch(proxyUrl + encodeURIComponent(directUrl));
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.items) {
      return data.items.map(item => ({
        id: item.id,
        title: item.volumeInfo.title || 'Sem título',
        authors: item.volumeInfo.authors || ['Autor não informado'],
        abstract: item.volumeInfo.description || 'Sinopse e descrição indisponíveis no momento.',
        url: item.volumeInfo.previewLink || item.volumeInfo.infoLink || '#',
        source: 'Google Books Library'
      }));
    }
    throw new Error();
  } catch {
    try {
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=type:book&sort=relevance_score:desc&per-page=20`;
      const res = await fetch(url);
      const data = await res.json();
      return (data.results || []).map(w => ({
        id: stableHash(w.id || w.title),
        title: w.title || 'Sem título',
        authors: w.authorships?.map(a => a.author.display_name) || [],
        abstract: w.abstract || 'Descrição do volume indisponível no acervo alternativo.',
        url: w.id,
        source: 'OpenAlex Backup Books'
      }));
    } catch { return []; }
  }
}

// ==================== RENDIMENTO GRÁFICO PROFISSIONAL ====================
function renderItemsGrid(container, items, type) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<div class="no-results">Nenhum registro encontrado para os parâmetros informados.</div>';
    return;
  }

  items.forEach(item => {
    const wrapper = document.createElement('div');
    wrapper.className = 'virtual-row';
    
    const isRead = store.read[type].has(item.id);
    
    wrapper.innerHTML = `
      <div class="result-card">
        <div class="checkbox ${isRead ? 'checked' : ''}" data-id="${escapeHtml(item.id)}">${isRead ? '✓' : ''}</div>
        <div class="card-content">
          <a href="${sanitizeUrl(item.url)}" target="_blank" class="card-title">${escapeHtml(item.title)}</a>
          <div class="card-meta">${escapeHtml(item.source)} // PRODUTOR: ${escapeHtml(item.authors.join(', '))}</div>
          <div class="card-abstract">${escapeHtml(item.abstract)}</div>
        </div>
      </div>
    `;

    wrapper.querySelector('.checkbox').addEventListener('click', async (e) => {
      const currentChecked = e.target.classList.contains('checked');
      await markAsReadInDB(item.id, type, !currentChecked);
      e.target.classList.toggle('checked');
      e.target.textContent = !currentChecked ? '✓' : '';
    });

    container.appendChild(wrapper);
  });
}

// ==================== CONTROLE DE INTERFACE DINÂMICA ====================
function injectSearchTab(placeholder, searchCallback, currentStoreType) {
  const container = document.getElementById('mainContent');
  container.innerHTML = `
    <div class="search-area">
      <input type="text" id="searchInputField" class="search-input" placeholder="${placeholder}" aria-label="Buscar">
      <button id="searchSubmitBtn" class="search-btn">Buscar</button>
    </div>
    <div class="results-grid" id="mainResultsGrid"></div>
  `;

  const input = document.getElementById('searchInputField');
  const btn = document.getElementById('searchSubmitBtn');
  const grid = document.getElementById('mainResultsGrid');

  if(store[currentStoreType] && store[currentStoreType].length > 0) {
    renderItemsGrid(grid, store[currentStoreType], currentStoreType.replace(/s$/, ''));
  } else {
    grid.innerHTML = '<div class="no-results">Aguardando termo para processamento cognitivo...</div>';
  }

  const exec = async () => {
    const q = input.value.trim();
    if (!q) return;
    btn.textContent = 'Processando...';
    const res = await searchCallback(q);
    store[currentStoreType] = res;
    renderItemsGrid(grid, res, currentStoreType.replace(/s$/, ''));
    btn.textContent = 'Buscar';
  };

  btn.addEventListener('click', exec);
  input.addEventListener('keypress', (e) => { if(e.key === 'Enter') exec(); });
}

async function renderSummaryTab() {
  const container = document.getElementById('mainContent');
  container.innerHTML = '<div class="no-results">Processando sinapses e leituras...</div>';

  const tx = store.db.transaction(['reading_log'], 'readonly');
  const allLogs = await new Promise(res => tx.objectStore('reading_log').getAll().onsuccess = e => res(e.target.result || []));

  if (!allLogs.length) {
    container.innerHTML = '<div class="no-results">Nenhum registro foi assimilado na memória permanente ainda.</div>';
    return;
  }

  container.innerHTML = `
    <div class="summary-section">
      <h3 class="summary-title">Artigos Integrados (${store.read.article.size})</h3>
      <div class="results-grid" id="sum-article"></div>
    </div>
    <div class="summary-section" style="margin-top: 24px;">
      <h3 class="summary-title">Livros Concluídos (${store.read.book.size})</h3>
      <div class="results-grid" id="sum-book"></div>
    </div>
    <div class="summary-section" style="margin-top: 24px;">
      <h3 class="summary-title">Pesquisas Mapeadas (${store.read.research.size})</h3>
      <div class="results-grid" id="sum-research"></div>
    </div>
  `;

  const sections = ['article', 'book', 'research'];
  
  sections.forEach(type => {
    const targetGrid = document.getElementById(`sum-${type}`);
    const matchedLogs = allLogs.filter(l => l.type === type);

    if(!matchedLogs.length) {
      targetGrid.innerHTML = '<div class="no-results" style="padding:15px; font-size: 0.85rem;">Sem registros nesta trilha neural.</div>';
    } else {
      matchedLogs.forEach(log => {
        const row = document.createElement('div');
        row.className = 'virtual-row';
        row.innerHTML = `
          <div class="result-card" style="border-color: rgba(0, 212, 255, 0.08)">
            <div class="card-content">
              <span class="card-title" style="font-size:1.05rem;">${escapeHtml(log.title || 'Registro sem identificador textual')}</span>
              <div class="card-meta">Index: ${escapeHtml(log.id)} · Data de Absorção: ${new Date(log.date).toLocaleDateString()}</div>
            </div>
          </div>
        `;
        targetGrid.appendChild(row);
      });
    }
  });
}

// ==================== INICIALIZADOR CENTRAL ====================
document.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  await loadInitialReadingLog();

  const tabs = document.querySelectorAll('.main-tab');
  
  const handleTabSwitch = (activeTab) => {
    tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    activeTab.classList.add('active');
    activeTab.setAttribute('aria-selected', 'true');
    
    store.currentTab = activeTab.getAttribute('data-main');
    
    if (store.currentTab === 'articles') {
      injectSearchTab('Mapear artigos científicos no OpenAlex...', async (q) => fetchOpenAlex(q, 'article'), 'articles');
    } else if (store.currentTab === 'books') {
      injectSearchTab('Localizar volumes no Google Books...', fetchBooks, 'books');
    } else if (store.currentTab === 'research') {
      injectSearchTab('Efetuar varredura em relatórios institucionais...', async (q) => fetchOpenAlex(q, 'research'), 'research');
    } else if (store.currentTab === 'summary') {
      renderSummaryTab();
    }
  };

  tabs.forEach(tab => tab.addEventListener('click', () => handleTabSwitch(tab)));
  handleTabSwitch(tabs[0]);
});
