// ==================== ESTADO CENTRALIZADO ====================
const store = {
  articles: [],
  books: [],
  research: [],
  read: {
    article: new Set(),
    book: new Set(),
    research: new Set()
  },
  favorites: {
    article: new Set(),
    book: new Set(),
    research: new Set()
  },
  currentTab: 'articles',
  db: null,
  // Paginação
  pagination: {
    page: 1,
    query: '',
    hasMore: true,
    isLoading: false
  }
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

function truncateText(text, maxLength = 300) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// ==================== INDEXEDDB ====================
async function openDB() {
  const DB_NAME = 'ReadPlusDB';
  const STORES = [
    'articles', 'books', 'research', 'notes', 'collections',
    'tags', 'favorites', 'reading_log', 'study_log', 'radar',
    'settings', 'zettels', 'backlinks'
  ];
  const TARGET_VERSION = 13;

  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, TARGET_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        STORES.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const options = storeName === 'settings' ? { keyPath: 'key' } : { keyPath: 'id' };
            db.createObjectStore(storeName, options);
          }
        });
        // Criar índices para buscas mais rápidas
        if (!db.objectStoreNames.contains('reading_log')) {
          const logStore = db.createObjectStore('reading_log', { keyPath: 'id' });
          logStore.createIndex('type', 'type', { unique: false });
          logStore.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('notes')) {
          const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
          notesStore.createIndex('type', 'type', { unique: false });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
    store.db = db;
    console.log('[READ+] IndexedDB aberto. Versão:', db.version);
    return db;
  } catch (err) {
    if (err.name === 'VersionError') {
      console.warn('[READ+] VersionError. Tentando abrir com versão existente...');
      try {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME);
          request.onsuccess = (e) => resolve(e.target.result);
          request.onerror = (e) => reject(e.target.error);
        });
        store.db = db;
        console.log('[READ+] Banco recuperado na versão:', db.version);
        return db;
      } catch (fallbackErr) {
        console.error('[READ+] Falha na recuperação. Tentando deletar e recriar...');
        await new Promise((resolve, reject) => {
          const deleteReq = indexedDB.deleteDatabase(DB_NAME);
          deleteReq.onsuccess = () => resolve();
          deleteReq.onerror = () => reject(deleteReq.error);
        });
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, TARGET_VERSION);
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            STORES.forEach(storeName => {
              if (!db.objectStoreNames.contains(storeName)) {
                const options = storeName === 'settings' ? { keyPath: 'key' } : { keyPath: 'id' };
                db.createObjectStore(storeName, options);
              }
            });
          };
          request.onsuccess = (e) => resolve(e.target.result);
          request.onerror = (e) => reject(e.target.error);
        });
        store.db = db;
        console.log('[READ+] Banco recriado com sucesso. Versão:', db.version);
        return db;
      }
    }
    throw err;
  }
}

async function markAsReadInDB(id, type, isRead) {
  if (!store.db) return;
  const tx = store.db.transaction(['reading_log'], 'readwrite');
  if (isRead) {
    const log = {
      id: `${type}_${id}`,
      type,
      date: new Date().toISOString()
    };
    tx.objectStore('reading_log').put(log);
    store.read[type].add(id);
  } else {
    tx.objectStore('reading_log').delete(`${type}_${id}`);
    store.read[type].delete(id);
  }
  return new Promise(res => { tx.oncomplete = () => res(); });
}

async function toggleFavoriteInDB(id, type, isFavorite) {
  if (!store.db) return;
  const tx = store.db.transaction(['favorites'], 'readwrite');
  if (isFavorite) {
    tx.objectStore('favorites').put({
      id: `${type}_${id}`,
      type,
      date: new Date().toISOString()
    });
    store.favorites[type].add(id);
  } else {
    tx.objectStore('favorites').delete(`${type}_${id}`);
    store.favorites[type].delete(id);
  }
  return new Promise(res => { tx.oncomplete = () => res(); });
}

async function saveNoteInDB(id, type, note) {
  if (!store.db) return;
  const tx = store.db.transaction(['notes'], 'readwrite');
  const noteObj = {
    id: `${type}_${id}`,
    type,
    note: note || '',
    date: new Date().toISOString()
  };
  tx.objectStore('notes').put(noteObj);
  return new Promise(res => { tx.oncomplete = () => res(); });
}

async function loadInitialData() {
  if (!store.db) return;
  
  // Carrega leituras
  await new Promise((resolve) => {
    const tx = store.db.transaction(['reading_log'], 'readonly');
    tx.objectStore('reading_log').getAll().onsuccess = (e) => {
      store.read.article.clear();
      store.read.book.clear();
      store.read.research.clear();
      const data = e.target.result || [];
      data.forEach(log => {
        const type = log.type || 'article';
        const id = log.id.replace(/^[^_]+_/, '');
        if (store.read[type]) store.read[type].add(id);
      });
      resolve();
    };
  });

  // Carrega favoritos
  await new Promise((resolve) => {
    const tx = store.db.transaction(['favorites'], 'readonly');
    tx.objectStore('favorites').getAll().onsuccess = (e) => {
      store.favorites.article.clear();
      store.favorites.book.clear();
      store.favorites.research.clear();
      const data = e.target.result || [];
      data.forEach(item => {
        const type = item.type || 'article';
        const id = item.id.replace(/^[^_]+_/, '');
        if (store.favorites[type]) store.favorites[type].add(id);
      });
      resolve();
    };
  });
}

// ==================== DADOS DE DEMONSTRAÇÃO ====================
function getDemoArticles(query, type) {
  const label = type === 'research' ? 'Pesquisa' : 'Artigo';
  return [
    {
      id: `demo_${Date.now()}_1`,
      title: `${label}: "${query}" - Modo Demonstração`,
      authors: ['READ+ Demo'],
      abstract: `Este é um resultado de demonstração para "${query}". O sistema está funcionando normalmente. Aguarde a API OpenAlex voltar ao ar para resultados reais.`,
      url: '#',
      source: '🔬 Modo Demonstração'
    },
    {
      id: `demo_${Date.now()}_2`,
      title: `${label} Científico sobre ${query} (Simulado)`,
      authors: ['Centro de Pesquisa READ+'],
      abstract: 'O READ+ está pronto para buscar dados reais assim que as APIs estiverem disponíveis. Esta é uma demonstração da interface e funcionalidades.',
      url: '#',
      source: '📄 Modo Demonstração'
    }
  ];
}

function getDemoBooks(query) {
  return [
    {
      id: `demo_book_${Date.now()}_1`,
      title: `Livro: "${query}" - Modo Demonstração`,
      authors: ['READ+ Demo'],
      abstract: `Este é um resultado de demonstração para "${query}". O sistema está funcionando normalmente. Aguarde a API Google Books retornar dados reais.`,
      url: '#',
      source: '📚 Modo Demonstração'
    },
    {
      id: `demo_book_${Date.now()}_2`,
      title: `Publicação sobre ${query} (Simulado)`,
      authors: ['Equipe READ+'],
      abstract: 'O READ+ está pronto para buscar dados reais assim que as APIs estiverem disponíveis. Esta é uma demonstração da interface e funcionalidades.',
      url: '#',
      source: '📖 Modo Demonstração'
    }
  ];
}

// ==================== MOTOR DE BUSCA — OPENALEX (COM PAGINAÇÃO) ====================
async function fetchOpenAlex(query, type = 'article', page = 1, filters = {}) {
  const filter = 'open_access.is_oa:true';
  const perPage = 20;
  const cursor = page === 1 ? '*' : store._openAlexCursor || '*';
  
  let url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=${filter}&sort=relevance_score:desc&per-page=${perPage}`;
  
  // Adiciona cursor para paginação (OpenAlex)
  if (page > 1 && store._openAlexCursor) {
    url += `&cursor=${store._openAlexCursor}`;
  }
  
  // Filtros
  if (filters.year) {
    url += `&filter=publication_year:${filters.year}`;
  }
  if (filters.sort === 'date') {
    url = url.replace('sort=relevance_score:desc', 'sort=publication_date:desc');
  } else if (filters.sort === 'citations') {
    url = url.replace('sort=relevance_score:desc', 'sort=cited_by_count:desc');
  }
  
  const cacheKey = `openalex_${query}_${type}_${page}_${JSON.stringify(filters)}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < 5 * 60 * 1000) {
        console.log('[READ+] Usando cache para:', query);
        store._openAlexCursor = data.cursor || '*';
        return data.results;
      }
    }
  } catch (_) {}

  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 503) {
        console.warn('[READ+] OpenAlex indisponível. Usando dados de demonstração.');
        return getDemoArticles(query, type);
      }
      throw new Error(`Erro ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    
    // Salva o cursor para próxima página
    store._openAlexCursor = data.meta?.next_cursor || '*';

    const results = (data.results || []).filter(w =>
      w.open_access?.is_oa &&
      (w.open_access?.oa_url || w.best_oa_location?.pdf_url)
    ).map(w => ({
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
      source: type === 'research' ? 'Estudo & Pesquisa Livre (PDF)' : 'Artigo Científico Disponível',
      publicationYear: w.publication_year,
      citedByCount: w.cited_by_count
    }));

    if (results.length > 0) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          timestamp: Date.now(),
          results,
          cursor: store._openAlexCursor
        }));
      } catch (_) {}
      return results;
    }
    return getDemoArticles(query, type);
  } catch (e) {
    console.error('[READ+] Erro na busca OpenAlex:', e);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      store._openAlexCursor = data.cursor || '*';
      return data.results;
    }
    return getDemoArticles(query, type);
  }
}

// ==================== MOTOR DE BUSCA — GOOGLE BOOKS (COM PAGINAÇÃO) ====================
async function fetchBooks(query, page = 1, filters = {}) {
  const API_KEY = 'AIzaSyBGhP_WMwjUKjI7vXP4TcyKHizxFw05lcI';
  const startIndex = (page - 1) * 20;
  let url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&startIndex=${startIndex}&key=${API_KEY}`;
  
  // Filtros
  if (filters.year) {
    url += `&printType=books&publishedDate=${filters.year}`;
  }
  if (filters.sort === 'date') {
    url += `&orderBy=newest`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 400) {
        console.warn('[READ+] Chave do Google Books inválida. Usando dados de demonstração.');
        return getDemoBooks(query);
      }
      if (res.status === 403) {
        console.warn('[READ+] Quota do Google Books excedida. Usando dados de demonstração.');
        return getDemoBooks(query);
      }
      if (res.status === 503) {
        console.warn('[READ+] Google Books indisponível. Usando dados de demonstração.');
        return getDemoBooks(query);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.items?.length) {
      return data.items.map(item => ({
        id: item.id,
        title: item.volumeInfo?.title || 'Sem título',
        authors: item.volumeInfo?.authors || ['Autor não informado'],
        abstract: item.volumeInfo?.description || 'Sinopse indisponível.',
        url: item.volumeInfo?.previewLink || item.volumeInfo?.infoLink || '#',
        source: 'Google Books',
        publicationYear: item.volumeInfo?.publishedDate?.substring(0, 4)
      }));
    }
    return getDemoBooks(query);
  } catch (error) {
    console.error('[READ+] Erro no Google Books:', error);
    return getDemoBooks(query);
  }
}

// ==================== EXPORTAÇÃO ====================
function exportResults(results, format = 'csv') {
  if (!results || !results.length) {
    alert('Nenhum resultado para exportar.');
    return;
  }

  if (format === 'csv') {
    const headers = ['Título', 'Autores', 'Resumo', 'Fonte'];
    const rows = results.map(r => [
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.authors.join('; ').replace(/"/g, '""')}"`,
      `"${truncateText(r.abstract, 500).replace(/"/g, '""')}"`,
      `"${r.source.replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `readplus-resultados-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// ==================== RENDERIZAÇÃO DOS CARDS ====================
function renderItemsGrid(container, items, type, showExport = true) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<div class="hint-text">Nenhum resultado encontrado. Tente outro termo de busca.</div>';
    return;
  }

  // Botão de exportação
  if (showExport && items.length > 0) {
    const exportDiv = document.createElement('div');
    exportDiv.style.cssText = 'display:flex; justify-content:flex-end; margin-bottom:12px; gap:8px;';
    exportDiv.innerHTML = `
      <button class="export-btn" data-format="csv" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:6px 14px; color:#fff; cursor:pointer; font-size:0.8rem;">
        📥 Exportar CSV
      </button>
    `;
    exportDiv.querySelector('.export-btn').addEventListener('click', () => {
      const currentItems = store[type === 'article' ? 'articles' : type === 'book' ? 'books' : 'research'] || [];
      exportResults(currentItems, 'csv');
    });
    container.appendChild(exportDiv);
  }

  items.forEach(item => {
    const wrapper = document.createElement('div');
    wrapper.className = 'virtual-row';

    const isRead = store.read[type]?.has(item.id) || false;
    const isFavorite = store.favorites[type]?.has(item.id) || false;

    wrapper.innerHTML = `
      <div class="result-card" style="position:relative;">
        <div style="display:flex; gap:12px; flex:1;">
          <div class="checkbox ${isRead ? 'checked' : ''}" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(type)}" title="Marcar como lido">${isRead ? '✓' : ''}</div>
          <div class="card-content" style="flex:1;">
            <a href="${sanitizeUrl(item.url)}" target="_blank" rel="noopener noreferrer" class="card-title">${escapeHtml(item.title)}</a>
            <div class="card-meta">${escapeHtml(item.source)} &nbsp;//&nbsp; ${escapeHtml(item.authors.slice(0, 3).join(', '))} ${item.publicationYear ? '· ' + item.publicationYear : ''}</div>
            <div class="card-abstract">${escapeHtml(truncateText(item.abstract, 350))}</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; align-items:center; min-width:32px;">
            <div class="favorite-btn ${isFavorite ? 'active' : ''}" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(type)}" title="Favorito" style="cursor:pointer; font-size:1.2rem; opacity:${isFavorite ? 1 : 0.3}; transition:all 0.2s;">
              ⭐
            </div>
            <div class="note-btn" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(type)}" title="Adicionar nota" style="cursor:pointer; font-size:1rem; opacity:0.5; transition:all 0.2s;">
              📝
            </div>
          </div>
        </div>
      </div>
    `;

    // Evento: Marcar como lido
    wrapper.querySelector('.checkbox').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const currentlyChecked = btn.classList.contains('checked');
      await markAsReadInDB(item.id, type, !currentlyChecked);
      btn.classList.toggle('checked');
      btn.textContent = !currentlyChecked ? '✓' : '';
    });

    // Evento: Favoritar
    wrapper.querySelector('.favorite-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const currentlyFav = btn.classList.contains('active');
      await toggleFavoriteInDB(item.id, type, !currentlyFav);
      btn.classList.toggle('active');
      btn.style.opacity = !currentlyFav ? '1' : '0.3';
    });

    // Evento: Adicionar nota
    wrapper.querySelector('.note-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const currentNote = await getNoteFromDB(item.id, type);
      const note = prompt('Adicione uma nota sobre este item:', currentNote || '');
      if (note !== null) {
        await saveNoteInDB(item.id, type, note);
        btn.style.opacity = note ? '1' : '0.5';
      }
    });

    container.appendChild(wrapper);
  });
}

// ==================== NOTAS ====================
async function getNoteFromDB(id, type) {
  if (!store.db) return null;
  return new Promise((resolve) => {
    const tx = store.db.transaction(['notes'], 'readonly');
    const req = tx.objectStore('notes').get(`${type}_${id}`);
    req.onsuccess = () => resolve(req.result?.note || null);
    req.onerror = () => resolve(null);
  });
}

// ==================== RENDERIZAÇÃO DE FILTROS ====================
function renderFilters() {
  return `
    <div class="filters-bar" style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; align-items:center;">
      <select id="filterYear" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:8px 12px; color:#fff; font-family:inherit;">
        <option value="">Todos os anos</option>
        <option value="2026">2026</option>
        <option value="2025">2025</option>
        <option value="2024">2024</option>
        <option value="2023">2023</option>
        <option value="2022">2022</option>
        <option value="2021">2021</option>
        <option value="2020">2020</option>
      </select>
      <select id="filterSort" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:8px 12px; color:#fff; font-family:inherit;">
        <option value="relevance">Relevância</option>
        <option value="date">Data (mais recente)</option>
        <option value="citations">Citações</option>
      </select>
    </div>
  `;
}

// ==================== INJEÇÃO DO BUSCADOR ====================
function injectSearchTab(placeholder, searchCallback, storeKey, itemType) {
  const container = document.getElementById('mainContent');
  if (!container) return;

  store.pagination.page = 1;
  store.pagination.hasMore = true;

  container.innerHTML = `
    <div class="search-area">
      <input type="text" id="searchInputField" class="search-input" placeholder="${placeholder}" aria-label="Campo de busca" autocomplete="off" />
      <button id="searchSubmitBtn" class="search-btn">Buscar</button>
    </div>
    ${renderFilters()}
    <div id="progressContainer" style="width:100%; height:3px; background:rgba(255,255,255,0.05); border-radius:2px; margin:8px 0; display:none;">
      <div id="progressBar" style="width:0%; height:100%; background:linear-gradient(90deg, #00d4ff, #7b2cbf); border-radius:2px; transition:width 0.3s;"></div>
    </div>
    <div class="results-grid" id="mainResultsGrid"></div>
  `;

  const input = document.getElementById('searchInputField');
  const btn = document.getElementById('searchSubmitBtn');
  const grid = document.getElementById('mainResultsGrid');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');

  function updateProgress(percent) {
    progressContainer.style.display = 'block';
    progressBar.style.width = Math.min(percent, 100) + '%';
    if (percent >= 100) {
      setTimeout(() => {
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
      }, 500);
    }
  }

  if (store[storeKey]?.length > 0) {
    renderItemsGrid(grid, store[storeKey], itemType);
    store.pagination.hasMore = store[storeKey].length >= 20;
  } else {
    grid.innerHTML = '<div class="hint-text">Digite a palavra-chave para iniciar o escaneamento cognitivo...</div>';
  }

  const exec = async (loadMore = false) => {
    const q = input.value.trim();
    if (!q) return;
    if (!loadMore) {
      store.pagination.page = 1;
      store.pagination.query = q;
      store[storeKey] = [];
      store.pagination.hasMore = true;
      grid.innerHTML = '<div class="hint-text">Escaneando repositórios globais...</div>';
    }

    if (store.pagination.isLoading) return;
    store.pagination.isLoading = true;
    btn.disabled = true;

    updateProgress(30);

    try {
      // Pega filtros
      const yearFilter = document.getElementById('filterYear')?.value || '';
      const sortFilter = document.getElementById('filterSort')?.value || 'relevance';
      const filters = { year: yearFilter, sort: sortFilter };

      const results = await searchCallback(q, store.pagination.page, filters);
      updateProgress(80);

      if (loadMore && store[storeKey]) {
        store[storeKey] = [...store[storeKey], ...results];
      } else {
        store[storeKey] = results;
      }
      
      renderItemsGrid(grid, store[storeKey], itemType);
      updateProgress(100);

      // Verifica se tem mais resultados
      store.pagination.hasMore = results.length >= 20;
      
      // Adiciona botão "Carregar mais"
      const existingBtn = document.getElementById('loadMoreBtn');
      if (existingBtn) existingBtn.remove();
      
      if (store.pagination.hasMore) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'loadMoreBtn';
        loadMoreBtn.textContent = '📥 Carregar mais resultados';
        loadMoreBtn.style.cssText = `
          width: 100%;
          padding: 14px;
          margin-top: 16px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          color: var(--text-secondary);
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-size: 0.85rem;
          transition: all 0.3s;
        `;
        loadMoreBtn.addEventListener('mouseenter', () => {
          loadMoreBtn.style.background = 'rgba(255,255,255,0.08)';
        });
        loadMoreBtn.addEventListener('mouseleave', () => {
          loadMoreBtn.style.background = 'rgba(255,255,255,0.05)';
        });
        loadMoreBtn.addEventListener('click', () => {
          store.pagination.page++;
          exec(true);
        });
        grid.parentNode.appendChild(loadMoreBtn);
      }

    } catch (err) {
      grid.innerHTML = '<div class="hint-text">Erro ao buscar. Tente novamente.</div>';
      console.error('[READ+] Erro:', err);
      updateProgress(100);
    }

    btn.textContent = 'Buscar';
    btn.disabled = false;
    store.pagination.isLoading = false;
  };

  btn.addEventListener('click', () => exec(false));
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') exec(false); });
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

    const allFavorites = await new Promise((resolve) => {
      const tx = store.db.transaction(['favorites'], 'readonly');
      tx.objectStore('favorites').getAll().onsuccess = (e) => resolve(e.target.result || []);
    });

    const allNotes = await new Promise((resolve) => {
      const tx = store.db.transaction(['notes'], 'readonly');
      tx.objectStore('notes').getAll().onsuccess = (e) => resolve(e.target.result || []);
    });

    const totalRead = allLogs.length;
    const totalFav = allFavorites.length;
    const totalNotes = allNotes.filter(n => n.note).length;

    // Gráfico de leituras por mês
    const months = {};
    allLogs.forEach(log => {
      const month = new Date(log.date).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
      months[month] = (months[month] || 0) + 1;
    });
    const maxCount = Math.max(...Object.values(months), 1);

    if (!allLogs.length && !allFavorites.length) {
      container.innerHTML = `
        <div class="hint-text">
          Nenhum material foi marcado como lido ainda.<br>
          Use o checkbox ⬜ nos cards para registrar suas leituras.<br><br>
          ⭐ Marque como favorito para encontrar facilmente depois.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px,1fr)); gap:12px; margin-bottom:24px;">
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:16px; text-align:center; border:1px solid rgba(255,255,255,0.05);">
          <div style="font-size:1.8rem; font-weight:700; color:#00d4ff;">${totalRead}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">Itens lidos</div>
        </div>
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:16px; text-align:center; border:1px solid rgba(255,255,255,0.05);">
          <div style="font-size:1.8rem; font-weight:700; color:#ffd700;">${totalFav}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">Favoritos</div>
        </div>
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:16px; text-align:center; border:1px solid rgba(255,255,255,0.05);">
          <div style="font-size:1.8rem; font-weight:700; color:#7b2cbf;">${totalNotes}</div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">Notas</div>
        </div>
      </div>
      <div class="summary-section">
        <h3 class="summary-title">📊 Leituras por Mês</h3>
        <div style="margin:12px 0 24px 0;">
          ${Object.entries(months).map(([month, count]) => `
            <div style="display:flex; align-items:center; gap:8px; margin:4px 0;">
              <span style="min-width:90px; font-size:0.75rem; color:var(--text-secondary);">${month}</span>
              <div style="flex:1; height:20px; background:rgba(255,255,255,0.03); border-radius:4px; overflow:hidden;">
                <div style="width:${(count / maxCount) * 100}%; height:100%; background:linear-gradient(90deg, #00d4ff, #7b2cbf); border-radius:4px; transition:width 0.5s;"></div>
              </div>
              <span style="font-size:0.75rem; min-width:30px; color:var(--text-secondary);">${count}</span>
            </div>
          `).join('')}
        </div>
      </div>
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
        <div class="results-grid" id="sum
