// ==================== ESTADO CENTRALIZADO DE FLUXO ====================
const store = {
  articles: [], books: [], research: [],
  read: { article: new Set(), book: new Set(), research: new Set() },
  currentTab: 'articles',
  db: null
};

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

// ==================== INDEXEDDB: PRESERVAÇÃO INTEGRAL V12 ====================
async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ReadPlusDB', 12);
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

// ==================== ENGINE DE BUSCA RECALIBRADO (FOCO EM PDF GRÁTIS) ====================
async function fetchOpenAlex(query, type = 'article') {
  // AJUSTE CRÍTICO: Removido filtros de tipo conflitantes. Forçando apenas PDFs de Acesso Aberto (Open Access)
  let filter = 'open_access.is_oa:true,has_pdf:true';
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=${filter}&sort=relevance_score:desc&per-page=20`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(w => ({
      id: stableHash(w.id || w.title),
      title: w.title || 'Sem título',
      authors: w.authorships?.map(a => a.author.display_name) || ['Autor não identificado'],
      abstract: w.abstract || (w.abstract_inverted_index ? Object.entries(w.abstract_inverted_index).sort((a,b)=>a[1][0]-b[1][0]).map(([w])=>w).join(' ') : 'Resumo e dados estruturais indisponíveis para consulta direta.'),
      url: w.open_access?.oa_url || w.best_oa_location?.pdf_url || w.id,
      source: type === 'research' ? 'Estudo & Pesquisa Livre (PDF)' : 'Artigo Científico Disponível'
    }));
  } catch (e) {
    console.error("Erro na busca OpenAlex:", e); return [];
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
        abstract: item.volumeInfo.description || 'Sinopse e descrição indisponíveis.',
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
        abstract: w.abstract || 'Descrição indisponível no acervo alternativo.',
        url: w.id,
        source: 'OpenAlex Backup Books'
      }));
    } catch { return []; }
  }
}

// ==================== RENDERIZAÇÃO COGNITIVA E INJEÇÃO DE INTERFACE ====================
function renderItemsGrid(container, items, type) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<div class="no-results">Nenhum estudo ou PDF gratuito foi localizado para este termo.</div>';
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
          <div class="card-meta">${escapeHtml(item.source)} // RESPONSÁVEL: ${escapeHtml(item.authors.join(', '))}</div>
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

function injectSearchTab(placeholder, searchCallback, currentStoreType) {
  const container = document.getElementById('mainContent');
  if (!container) return;

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

  if (store[currentStoreType] && store[currentStoreType].length > 0) {
    renderItemsGrid(grid, store[currentStoreType], currentStoreType.replace(/s$/, ''));
  } else {
    grid.innerHTML = '<div class="no-results">Digite a palavra-chave para iniciar o escaneamento cognitivo...</div>';
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
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') exec(); });
}

async function renderSummaryTab() {
  const container = document.getElementById('mainContent');
  container.innerHTML = '<div class="no-results">Sincronizando banco de leituras assimiladas...</div>';

  const tx = store.db.transaction(['reading_log'], 'readonly');
  const allLogs = await new Promise(res => tx.objectStore('reading_log').getAll().onsuccess = e => res(e.target.result || []));

  if (!allLogs.length) {
    container.innerHTML = '<div class="no-results">Nenhum material foi arquivado na aba de leitura ainda.</div>';
    return;
  }

  container.innerHTML = `
    <div class="summary-section">
      <h3 class="summary-title">Artigos Lidos (${store.read.article.size})</h3>
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

    if (!matchedLogs.length) {
      targetGrid.innerHTML = '<div class="no-results" style="padding:15px; font-size: 0.85rem;">Sem registros nesta trilha neural.</div>';
    } else {
      matchedLogs.forEach(log => {
        const row = document.createElement('div');
        row.className = 'virtual-row';
        row.innerHTML = `
          <div class="result-card" style="border-color: rgba(0, 212, 255, 0.08)">
            <div class="card-content">
              <span class="card-title" style="font-size:1.05rem;">${escapeHtml(log.title || 'Material Sem Identificação')}</span>
              <div class="card-meta">Indexador: ${escapeHtml(log.id)} · Absorvido em: ${new Date(log.date).toLocaleDateString()}</div>
            </div>
          </div>
        `;
        targetGrid.appendChild(row);
      });
    }
  });
}

// ==================== INICIALIZADOR EXECUTÁVEL E SEGURO ====================
async function initSystem() {
  try {
    await openDB();
    await loadInitialReadingLog();

    const tabs = document.querySelectorAll('.main-tab');
    
    const handleTabSwitch = (activeTab) => {
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      activeTab.classList.add('active');
      activeTab.setAttribute('aria-selected', 'true');
      
      store.currentTab = activeTab.getAttribute('data-main');
      
      if (store.currentTab === 'articles') {
        injectSearchTab('Buscar artigos acadêmicos no OpenAlex...', async (q) => fetchOpenAlex(q, 'article'), 'articles');
      } else if (store.currentTab === 'books') {
        injectSearchTab('Localizar publicações no Google Books...', fetchBooks, 'books');
      } else if (store.currentTab === 'research') {
        injectSearchTab('Buscar pesquisas e estudos científicos gratuitos em PDF...', async (q) => fetchOpenAlex(q, 'research'), 'research');
      } else if (store.currentTab === 'summary') {
        renderSummaryTab();
      }
    };

    tabs.forEach(tab => tab.addEventListener('click', () => handleTabSwitch(tab)));
    
    // Força a renderização inicial imediatamente com segurança
    handleTabSwitch(tabs[0]);
  } catch (error) {
    console.error("Falha fatal na inicialização neural:", error);
  }
}

// Garante execução imediata assim que a árvore do DOM estiver montada
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSystem);
} else {
  initSystem();
}
