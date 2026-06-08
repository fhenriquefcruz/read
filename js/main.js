// ==================== ESTADO CENTRALIZADO ====================
const store = {
  articles: [],
  books: [],
  research: [],
  read: {
    article:  new Set(),
    book:     new Set(),
    research: new Set()
  },
  currentTab: 'articles',
  db: null
};

// ==================== UTILITÁRIOS ====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
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

// ==================== INDEXEDDB — BOOT RESILIENTE ====================
// Trata VersionError: se o banco local estiver numa versão MAIOR que 12,
// abre sem especificar versão (usa a versão atual do navegador) em vez de travar.
async function openDB() {
  return new Promise((resolve, reject) => {

    const STORES = [
      'articles', 'books', 'research', 'notes', 'collections',
      'tags', 'favorites', 'reading_log', 'study_log', 'radar',
      'settings', 'zettels', 'backlinks'
    ];

    const request = indexedDB.open('ReadPlusDB', 12);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      STORES.forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, {
            keyPath: storeName === 'settings' ? 'key' : 'id'
          });
        }
      });
    };

    request.onsuccess = (event) => {
      store.db = event.target.result;
      console.log('[READ+] IndexedDB aberto. Versão:', store.db.version);
      resolve(store.db);
    };

    // VersionError: banco local está numa versão maior que 12
    // Solução: abre sem versão para usar a versão que já existe
    request.onerror = (event) => {
      const err = event.target.error;

      if (err && err.name === 'VersionError') {
        console.warn('[READ+] VersionError detectado. Abrindo na versão local existente...');

        const recovery = indexedDB.open('ReadPlusDB');

        recovery.onsuccess = (e) => {
          store.db = e.target.result;
          console.log('[READ+] Banco recuperado na versão:', store.db.version);
          resolve(store.db);
        };

        recovery.onerror = (e) => {
          console.error('[READ+] Falha na recuperação do banco:', e.target.error);
          reject(e.target.error);
        };

      } else {
        reject(err);
      }
    };
  });
}

async function markAsReadInDB(id, type, isRead) {
  if (!store.db) return;
  const tx = store.db.transaction(['reading_log'], 'readwrite');
  if (isRead) {
    tx.objectStore('reading_log').put({ id, type, date: new Date().toISOString() });
    store.read[type].add(id);
  } else {
    tx.objectStore('reading_log').delete(id);
    store.read[type].delete(id);
  }
  return new Promise(res => { tx.oncomplete = () => res(); });
}

async function loadInitialReadingLog() {
  if (!store.db) return;
  return new Promise((resolve) => {
    const tx = store.db.transaction(['reading_log'], 'readonly');
    tx.objectStore('reading_log').getAll().onsuccess = (e) => {
      store.read.article.clear();
      store.read.book.clear();
      store.read.research.clear();
      const data = e.target.result || [];
      data.forEach(log => {
        if (store.read[log.type]) store.read[log.type].add(log.id);
      });
      resolve();
    };
  });
}

// ==================== MOTOR DE BUSCA — OPENALEX ====================
async function fetchOpenAlex(query, type = 'article') {
  // Filtra apenas PDFs Open Access válidos
  const filter = 'open_access.is_oa:true';
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=${filter}&sort=relevance_score:desc&per-page=20`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    // Filtragem local: garante que existe URL de PDF gratuito
    const results = (data.results || []).filter(w =>
      w.open_access?.is_oa &&
      (w.open_access?.oa_url || w.best_oa_location?.pdf_url)
    );

    return results.map(w => ({
      id: stableHash(w.id || w.title || Math.random().toString()),
      title: w.title || 'Sem título',
      authors: w.authorships?.map(a => a.author?.display_name).filter(Boolean) || ['Autor não identificado'],
      abstract: w.abstract ||
        (w.abstract_inverted_index
          ? Object.entries(w.abstract_inverted_index)
              .sort((a, b) => a[1][0] - b[1][0])
              .map(([word]) => word)
              .join(' ')
          : 'Resumo indisponível.'),
      url: w.best_oa_location?.pdf_url || w.open_access?.oa_url || w.id,
      source: type === 'research' ? 'Estudo & Pesquisa Livre (PDF)' : 'Artigo Científico Disponível'
    }));

  } catch (e) {
    console.error('[READ+] Erro na busca OpenAlex:', e);
    return [];
  }
}

// ==================== MOTOR DE BUSCA — GOOGLE BOOKS ====================
async function fetchBooks(query) {
  const directUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&printType=books`;

  // Tenta Google Books com proxy CORS
  try {
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(directUrl);
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('proxy fail');
    const data = await res.json();
    if (data.items?.length) {
      return data.items.map(item => ({
        id: item.id,
        title: item.volumeInfo?.title || 'Sem título',
        authors: item.volumeInfo?.authors || ['Autor não informado'],
        abstract: item.volumeInfo?.description || 'Sinopse indisponível.',
        url: item.volumeInfo?.previewLink || item.volumeInfo?.infoLink || '#',
        source: 'Google Books Library'
      }));
    }
    throw new Error('no items');
  } catch {
    // Fallback: OpenAlex com filtro de livros
    try {
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=type:book&sort=relevance_score:desc&per-page=20`;
      const res = await fetch(url);
      const data = await res.json();
      return (data.results || []).map(w => ({
        id: stableHash(w.id || w.title || Math.random().toString()),
        title: w.title || 'Sem título',
        authors: w.authorships?.map(a => a.author?.display_name).filter(Boolean) || [],
        abstract: w.abstract || 'Descrição indisponível.',
        url: w.open_access?.oa_url || w.best_oa_location?.pdf_url || w.id,
        source: 'OpenAlex Books (fallback)'
      }));
    } catch {
      return [];
    }
  }
}

// ==================== RENDERIZAÇÃO DOS CARDS ====================
function renderItemsGrid(container, items, type) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<div class="hint-text">Nenhum resultado encontrado. Tente outro termo de busca.</div>';
    return;
  }

  items.forEach(item => {
    const wrapper = document.createElement('div');
    wrapper.className = 'virtual-row';

    const isRead = store.read[type]?.has(item.id) || false;

    wrapper.innerHTML = `
      <div class="result-card">
        <div class="checkbox ${isRead ? 'checked' : ''}" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(type)}" title="Marcar como lido">${isRead ? '✓' : ''}</div>
        <div class="card-content">
          <a href="${sanitizeUrl(item.url)}" target="_blank" rel="noopener noreferrer" class="card-title">${escapeHtml(item.title)}</a>
          <div class="card-meta">${escapeHtml(item.source)} &nbsp;//&nbsp; ${escapeHtml(item.authors.slice(0, 3).join(', '))}</div>
          <div class="card-abstract">${escapeHtml(item.abstract)}</div>
        </div>
      </div>
    `;

    wrapper.querySelector('.checkbox').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const currentlyChecked = btn.classList.contains('checked');
      await markAsReadInDB(item.id, type, !currentlyChecked);
      btn.classList.toggle('checked');
      btn.textContent = !currentlyChecked ? '✓' : '';
    });

    container.appendChild(wrapper);
  });
}

// ==================== INJEÇÃO DO BUSCADOR ====================
function injectSearchTab(placeholder, searchCallback, storeKey, itemType) {
  const container = document.getElementById('mainContent');
  if (!container) return;

  container.innerHTML = `
    <div class="search-area">
      <input type="text" id="searchInputField" class="search-input" placeholder="${placeholder}" aria-label="Campo de busca" autocomplete="off" />
      <button id="searchSubmitBtn" class="search-btn">Buscar</button>
    </div>
    <div class="results-grid" id="mainResultsGrid"></div>
  `;

  const input = document.getElementById('searchInputField');
  const btn   = document.getElementById('searchSubmitBtn');
  const grid  = document.getElementById('mainResultsGrid');

  // Exibe resultados anteriores se houver
  if (store[storeKey]?.length > 0) {
    renderItemsGrid(grid, store[storeKey], itemType);
  } else {
    grid.innerHTML = '<div class="hint-text">Digite a palavra-chave para iniciar o escaneamento cognitivo...</div>';
  }

  const exec = async () => {
    const q = input.value.trim();
    if (!q) return;
    btn.textContent = 'Buscando...';
    btn.disabled = true;
    grid.innerHTML = '<div class="hint-text">Escaneando repositórios globais...</div>';

    try {
      const results = await searchCallback(q);
      store[storeKey] = results;
      renderItemsGrid(grid, results, itemType);
    } catch (err) {
      grid.innerHTML = '<div class="hint-text">Erro ao buscar. Tente novamente.</div>';
      console.error('[READ+] Erro:', err);
    }

    btn.textContent = 'Buscar';
    btn.disabled = false;
  };

  btn.addEventListener('click', exec);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') exec(); });
}

// ==================== ABA RESUMO ====================
async function renderSummaryTab() {
  const container = document.getElementById('mainContent');
  if (!container) return;

  if (!store.db) {
    container.innerHTML = '<div class="hint-text">Banco de dados ainda não disponível. Aguarde alguns segundos e tente novamente.</div>';
    return;
  }

  container.innerHTML = '<div class="hint-text">Sincronizando histórico de leituras...</div>';

  try {
    const allLogs = await new Promise((resolve) => {
      const tx = store.db.transaction(['reading_log'], 'readonly');
      tx.objectStore('reading_log').getAll().onsuccess = (e) => resolve(e.target.result || []);
    });

    if (!allLogs.length) {
      container.innerHTML = '<div class="hint-text">Nenhum material foi marcado como lido ainda.<br>Use o checkbox nos cards para registrar suas leituras.</div>';
      return;
    }

    container.innerHTML = `
      <div class="summary-section">
        <h3 class="summary-title">Artigos Lidos (${store.read.article.size})</h3>
        <div class="results-grid" id="sum-article"></div>
      </div>
      <div class="summary-section">
        <h3 class="summary-title">Livros Concluídos (${store.read.book.size})</h3>
        <div class="results-grid" id="sum-book"></div>
      </div>
      <div class="summary-section">
        <h3 class="summary-title">Pesquisas Mapeadas (${store.read.research.size})</h3>
        <div class="results-grid" id="sum-research"></div>
      </div>
    `;

    ['article', 'book', 'research'].forEach(type => {
      const grid = document.getElementById(`sum-${type}`);
      const logs = allLogs.filter(l => l.type === type);

      if (!logs.length) {
        grid.innerHTML = '<div class="hint-text" style="padding:16px; font-size:0.82rem;">Sem registros nesta categoria.</div>';
        return;
      }

      logs.forEach(log => {
        const row = document.createElement('div');
        row.className = 'virtual-row';
        row.innerHTML = `
          <div class="result-card">
            <div class="card-content">
              <span class="card-title" style="font-size:1rem; cursor:default;">${escapeHtml(log.title || 'Material sem identificação')}</span>
              <div class="card-meta">ID: ${escapeHtml(log.id)} &nbsp;·&nbsp; Lido em: ${new Date(log.date).toLocaleDateString('pt-BR')}</div>
            </div>
          </div>
        `;
        grid.appendChild(row);
      });
    });

  } catch (err) {
    container.innerHTML = '<div class="hint-text">Erro ao carregar o histórico.</div>';
    console.error('[READ+] Erro no Resumo:', err);
  }
}

// ==================== ROUTER DE ABAS ====================
const TAB_ROUTES = {
  articles: () => injectSearchTab(
    'Buscar artigos acadêmicos no OpenAlex...',
    (q) => fetchOpenAlex(q, 'article'),
    'articles',
    'article'
  ),
  books: () => injectSearchTab(
    'Localizar publicações no Google Books...',
    fetchBooks,
    'books',
    'book'
  ),
  research: () => injectSearchTab(
    'Buscar pesquisas e estudos científicos gratuitos em PDF...',
    (q) => fetchOpenAlex(q, 'research'),
    'research',
    'research'
  ),
  summary: () => renderSummaryTab()
};

// ==================== INICIALIZADOR ====================
function initSystem() {
  const tabs = document.querySelectorAll('.main-tab');

  if (!tabs.length) {
    console.error('[READ+] Abas não encontradas no DOM.');
    return;
  }

  function handleTabSwitch(activeTab) {
    tabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    activeTab.classList.add('active');
    activeTab.setAttribute('aria-selected', 'true');
    store.currentTab = activeTab.getAttribute('data-main');
    const route = TAB_ROUTES[store.currentTab];
    if (route) route();
  }

  tabs.forEach(tab => tab.addEventListener('click', () => handleTabSwitch(tab)));

  // PASSO 1: Renderiza a interface imediatamente — não espera o banco
  handleTabSwitch(tabs[0]);

  // PASSO 2: Abre o banco em background sem bloquear a UI
  openDB()
    .then(() => loadInitialReadingLog())
    .then(() => {
      console.log('[READ+] Banco sincronizado com sucesso.');
      // Se o usuário já estiver na aba Resumo, re-renderiza com os dados reais
      if (store.currentTab === 'summary') {
        renderSummaryTab();
      }
    })
    .catch(err => {
      console.error('[READ+] Banco indisponível (modo offline ou erro):', err);
      // App continua funcional para busca, apenas sem persistência
    });
}

// Executa assim que o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSystem);
} else {
  initSystem();
}
