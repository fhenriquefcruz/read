// ==================== ESTADO CENTRALIZADO ====================
var store = {
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
  pagination: {
    page: 1,
    query: '',
    hasMore: true,
    isLoading: false
  },
  _openAlexCursor: '*'
};

// ==================== UTILITÁRIOS ====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[m];
  });
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  var t = url.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return t;
  }
  return '#';
}

function stableHash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h).toString(36);
}

function truncateText(text, maxLength) {
  if (maxLength === undefined) maxLength = 300;
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function isPDFUrl(url) {
  if (!url) return false;
  var lower = url.toLowerCase();
  return lower.endsWith('.pdf') || lower.includes('pdf') || lower.includes('arxiv') || lower.includes('sci-hub');
}

// ==================== INDEXEDDB ====================
async function openDB() {
  var DB_NAME = 'ReadPlusDB';
  var STORES = [
    'articles', 'books', 'research', 'notes', 'collections',
    'tags', 'favorites', 'reading_log', 'study_log', 'radar',
    'settings', 'zettels', 'backlinks'
  ];
  var TARGET_VERSION = 13;

  try {
    var db = await new Promise(function(resolve, reject) {
      var request = indexedDB.open(DB_NAME, TARGET_VERSION);
      request.onupgradeneeded = function(event) {
        var db = event.target.result;
        STORES.forEach(function(storeName) {
          if (!db.objectStoreNames.contains(storeName)) {
            var options = storeName === 'settings' ? { keyPath: 'key' } : { keyPath: 'id' };
            db.createObjectStore(storeName, options);
          }
        });
        if (!db.objectStoreNames.contains('reading_log')) {
          var logStore = db.createObjectStore('reading_log', { keyPath: 'id' });
          logStore.createIndex('type', 'type', { unique: false });
          logStore.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('notes')) {
          var notesStore = db.createObjectStore('notes', { keyPath: 'id' });
          notesStore.createIndex('type', 'type', { unique: false });
        }
        if (!db.objectStoreNames.contains('favorites')) {
          var favStore = db.createObjectStore('favorites', { keyPath: 'id' });
          favStore.createIndex('type', 'type', { unique: false });
        }
      };
      request.onsuccess = function(e) { resolve(e.target.result); };
      request.onerror = function(e) { reject(e.target.error); };
    });
    store.db = db;
    console.log('[READ+] IndexedDB aberto. Versão:', db.version);
    return db;
  } catch (err) {
    if (err.name === 'VersionError') {
      console.warn('[READ+] VersionError. Tentando abrir com versão existente...');
      try {
        var db = await new Promise(function(resolve, reject) {
          var request = indexedDB.open(DB_NAME);
          request.onsuccess = function(e) { resolve(e.target.result); };
          request.onerror = function(e) { reject(e.target.error); };
        });
        store.db = db;
        console.log('[READ+] Banco recuperado na versão:', db.version);
        return db;
      } catch (fallbackErr) {
        console.error('[READ+] Falha na recuperação. Tentando deletar e recriar...');
        await new Promise(function(resolve, reject) {
          var deleteReq = indexedDB.deleteDatabase(DB_NAME);
          deleteReq.onsuccess = function() { resolve(); };
          deleteReq.onerror = function() { reject(deleteReq.error); };
        });
        var db = await new Promise(function(resolve, reject) {
          var request = indexedDB.open(DB_NAME, TARGET_VERSION);
          request.onupgradeneeded = function(event) {
            var db = event.target.result;
            STORES.forEach(function(storeName) {
              if (!db.objectStoreNames.contains(storeName)) {
                var options = storeName === 'settings' ? { keyPath: 'key' } : { keyPath: 'id' };
                db.createObjectStore(storeName, options);
              }
            });
          };
          request.onsuccess = function(e) { resolve(e.target.result); };
          request.onerror = function(e) { reject(e.target.error); };
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
  var tx = store.db.transaction(['reading_log'], 'readwrite');
  if (isRead) {
    var log = { id: type + '_' + id, type: type, date: new Date().toISOString() };
    tx.objectStore('reading_log').put(log);
    store.read[type].add(id);
  } else {
    tx.objectStore('reading_log').delete(type + '_' + id);
    store.read[type].delete(id);
  }
  return new Promise(function(res) { tx.oncomplete = function() { res(); }; });
}

async function toggleFavoriteInDB(id, type, isFavorite) {
  if (!store.db) return;
  var tx = store.db.transaction(['favorites'], 'readwrite');
  if (isFavorite) {
    tx.objectStore('favorites').put({ id: type + '_' + id, type: type, date: new Date().toISOString() });
    store.favorites[type].add(id);
  } else {
    tx.objectStore('favorites').delete(type + '_' + id);
    store.favorites[type].delete(id);
  }
  return new Promise(function(res) { tx.oncomplete = function() { res(); }; });
}

async function saveNoteInDB(id, type, note) {
  if (!store.db) return;
  var tx = store.db.transaction(['notes'], 'readwrite');
  tx.objectStore('notes').put({ id: type + '_' + id, type: type, note: note || '', date: new Date().toISOString() });
  return new Promise(function(res) { tx.oncomplete = function() { res(); }; });
}

async function getNoteFromDB(id, type) {
  if (!store.db) return null;
  return new Promise(function(resolve) {
    var tx = store.db.transaction(['notes'], 'readonly');
    var req = tx.objectStore('notes').get(type + '_' + id);
    req.onsuccess = function() { resolve(req.result ? req.result.note : null); };
    req.onerror = function() { resolve(null); };
  });
}

async function loadInitialData() {
  if (!store.db) return;

  await new Promise(function(resolve) {
    var tx = store.db.transaction(['reading_log'], 'readonly');
    tx.objectStore('reading_log').getAll().onsuccess = function(e) {
      store.read.article.clear();
      store.read.book.clear();
      store.read.research.clear();
      (e.target.result || []).forEach(function(log) {
        var type = log.type || 'article';
        var id = log.id.replace(/^[^_]+_/, '');
        if (store.read[type]) store.read[type].add(id);
      });
      resolve();
    };
  });

  await new Promise(function(resolve) {
    var tx = store.db.transaction(['favorites'], 'readonly');
    tx.objectStore('favorites').getAll().onsuccess = function(e) {
      store.favorites.article.clear();
      store.favorites.book.clear();
      store.favorites.research.clear();
      (e.target.result || []).forEach(function(item) {
        var type = item.type || 'article';
        var id = item.id.replace(/^[^_]+_/, '');
        if (store.favorites[type]) store.favorites[type].add(id);
      });
      resolve();
    };
  });
}

// ==================== DADOS DE DEMONSTRAÇÃO ====================
function getDemoArticles(query, type) {
  var label = type === 'research' ? 'Pesquisa Científica' : 'Artigo Acadêmico';
  return [
    {
      id: 'demo_' + Date.now() + '_1',
      title: label + ': "' + query + '" - Modo Demonstração',
      authors: ['READ+ Demo'],
      abstract: 'Este é um resultado de demonstração para "' + query + '". O sistema está funcionando normalmente.',
      url: '#',
      source: '🔬 Modo Demonstração',
      isPDF: false
    },
    {
      id: 'demo_' + Date.now() + '_2',
      title: label + ' sobre ' + query + ' (Simulado)',
      authors: ['Centro de Pesquisa READ+'],
      abstract: 'O READ+ está pronto para buscar dados reais assim que as APIs estiverem disponíveis.',
      url: '#',
      source: '📄 Modo Demonstração',
      isPDF: false
    }
  ];
}

function getDemoBooks(query) {
  return [
    {
      id: 'demo_book_' + Date.now() + '_1',
      title: 'Livro: "' + query + '" - Modo Demonstração',
      authors: ['READ+ Demo'],
      abstract: 'Este é um resultado de demonstração para "' + query + '".',
      url: '#',
      source: '📚 Modo Demonstração',
      isPDF: false
    },
    {
      id: 'demo_book_' + Date.now() + '_2',
      title: 'Publicação sobre ' + query + ' (Simulado)',
      authors: ['Equipe READ+'],
      abstract: 'O READ+ está pronto para buscar dados reais.',
      url: '#',
      source: '📖 Modo Demonstração',
      isPDF: false
    }
  ];
}

// ==================== MOTOR DE BUSCA — ARTIGOS (OpenAlex - apenas artigos) ====================
async function fetchArticles(query, page, filters) {
  if (page === undefined) page = 1;
  if (filters === undefined) filters = {};

  var perPage = 20;
  var url = 'https://api.openalex.org/works?search=' + encodeURIComponent(query) + 
            '&filter=open_access.is_oa:true,type:article&sort=relevance_score:desc&per-page=' + perPage;

  if (page > 1 && store._openAlexCursor && store._openAlexCursor !== '*') {
    url += '&cursor=' + store._openAlexCursor;
  }

  if (filters.year) url += ',publication_year:' + filters.year;
  if (filters.sort === 'date') {
    url = url.replace('sort=relevance_score:desc', 'sort=publication_date:desc');
  } else if (filters.sort === 'citations') {
    url = url.replace('sort=relevance_score:desc', 'sort=cited_by_count:desc');
  }

  var cacheKey = 'articles_' + query + '_' + page + '_' + JSON.stringify(filters);

  try {
    var cached = localStorage.getItem(cacheKey);
    if (cached) {
      var data = JSON.parse(cached);
      if (Date.now() - data.timestamp < 300000) {
        store._openAlexCursor = data.cursor || '*';
        return data.results;
      }
    }
  } catch (_) {}

  try {
    var res = await fetch(url);
    if (!res.ok) {
      if (res.status === 503) {
        console.warn('[READ+] OpenAlex indisponível.');
        return getDemoArticles(query, 'article');
      }
      throw new Error('Erro ' + res.status);
    }
    var data = await res.json();
    store._openAlexCursor = data.meta ? data.meta.next_cursor || '*' : '*';

    var results = (data.results || []).filter(function(w) {
      return w.open_access && w.open_access.is_oa && 
             (w.open_access.oa_url || (w.best_oa_location && w.best_oa_location.pdf_url));
    }).map(function(w) {
      var pdfUrl = (w.best_oa_location && w.best_oa_location.pdf_url) || w.open_access.oa_url || w.id;
      return {
        id: stableHash(w.id || w.title || Math.random().toString()),
        title: w.title || 'Sem título',
        authors: (w.authorships || []).map(function(a) { return a.author ? a.author.display_name : null; }).filter(Boolean) || ['Autor não identificado'],
        abstract: w.abstract || (w.abstract_inverted_index ? Object.entries(w.abstract_inverted_index).sort(function(a, b) { return a[1][0] - b[1][0]; }).map(function(entry) { return entry[0]; }).join(' ') : 'Resumo indisponível.'),
        url: pdfUrl,
        source: '📄 Artigo Científico (PDF)',
        publicationYear: w.publication_year,
        citedByCount: w.cited_by_count,
        isPDF: isPDFUrl(pdfUrl)
      };
    });

    if (results.length > 0) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), results: results, cursor: store._openAlexCursor }));
      } catch (_) {}
      return results;
    }
    return getDemoArticles(query, 'article');
  } catch (e) {
    console.error('[READ+] Erro ao buscar artigos:', e);
    var cached2 = localStorage.getItem(cacheKey);
    if (cached2) {
      var data2 = JSON.parse(cached2);
      store._openAlexCursor = data2.cursor || '*';
      return data2.results;
    }
    return getDemoArticles(query, 'article');
  }
}

// ==================== MOTOR DE BUSCA — PESQUISAS (OpenAlex - apenas pesquisas/estudos) ====================
async function fetchResearch(query, page, filters) {
  if (page === undefined) page = 1;
  if (filters === undefined) filters = {};

  var perPage = 20;
  var url = 'https://api.openalex.org/works?search=' + encodeURIComponent(query) + 
            '&filter=open_access.is_oa:true,type:research|dissertation|thesis&sort=relevance_score:desc&per-page=' + perPage;

  if (page > 1 && store._openAlexCursor && store._openAlexCursor !== '*') {
    url += '&cursor=' + store._openAlexCursor;
  }

  if (filters.year) url += ',publication_year:' + filters.year;
  if (filters.sort === 'date') {
    url = url.replace('sort=relevance_score:desc', 'sort=publication_date:desc');
  } else if (filters.sort === 'citations') {
    url = url.replace('sort=relevance_score:desc', 'sort=cited_by_count:desc');
  }

  var cacheKey = 'research_' + query + '_' + page + '_' + JSON.stringify(filters);

  try {
    var cached = localStorage.getItem(cacheKey);
    if (cached) {
      var data = JSON.parse(cached);
      if (Date.now() - data.timestamp < 300000) {
        store._openAlexCursor = data.cursor || '*';
        return data.results;
      }
    }
  } catch (_) {}

  try {
    var res = await fetch(url);
    if (!res.ok) {
      if (res.status === 503) {
        console.warn('[READ+] OpenAlex indisponível.');
        return getDemoArticles(query, 'research');
      }
      throw new Error('Erro ' + res.status);
    }
    var data = await res.json();
    store._openAlexCursor = data.meta ? data.meta.next_cursor || '*' : '*';

    var results = (data.results || []).filter(function(w) {
      return w.open_access && w.open_access.is_oa && 
             (w.open_access.oa_url || (w.best_oa_location && w.best_oa_location.pdf_url));
    }).map(function(w) {
      var pdfUrl = (w.best_oa_location && w.best_oa_location.pdf_url) || w.open_access.oa_url || w.id;
      return {
        id: stableHash(w.id || w.title || Math.random().toString()),
        title: w.title || 'Sem título',
        authors: (w.authorships || []).map(function(a) { return a.author ? a.author.display_name : null; }).filter(Boolean) || ['Autor não identificado'],
        abstract: w.abstract || (w.abstract_inverted_index ? Object.entries(w.abstract_inverted_index).sort(function(a, b) { return a[1][0] - b[1][0]; }).map(function(entry) { return entry[0]; }).join(' ') : 'Resumo indisponível.'),
        url: pdfUrl,
        source: '🔬 Pesquisa Científica (PDF)',
        publicationYear: w.publication_year,
        citedByCount: w.cited_by_count,
        isPDF: isPDFUrl(pdfUrl)
      };
    });

    if (results.length > 0) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), results: results, cursor: store._openAlexCursor }));
      } catch (_) {}
      return results;
    }
    return getDemoArticles(query, 'research');
  } catch (e) {
    console.error('[READ+] Erro ao buscar pesquisas:', e);
    var cached2 = localStorage.getItem(cacheKey);
    if (cached2) {
      var data2 = JSON.parse(cached2);
      store._openAlexCursor = data2.cursor || '*';
      return data2.results;
    }
    return getDemoArticles(query, 'research');
  }
}

// ==================== MOTOR DE BUSCA — LIVROS (Google Books - apenas com PDF) ====================
async function fetchBooks(query, page, filters) {
  if (page === undefined) page = 1;
  if (filters === undefined) filters = {};
  
  var API_KEY = 'AIzaSyBGhP_WMwjUKjI7vXP4TcyKHizxFw05lcI';
  var startIndex = (page - 1) * 20;
  var url = 'https://www.googleapis.com/books/v1/volumes?q=' + encodeURIComponent(query) + '&maxResults=40&startIndex=' + startIndex + '&key=' + API_KEY;

  if (filters.year) url += '&printType=books&publishedDate=' + filters.year;
  if (filters.sort === 'date') url += '&orderBy=newest';

  try {
    var res = await fetch(url);
    if (!res.ok) {
      if ([400, 403, 503].indexOf(res.status) !== -1) {
        console.warn('[READ+] Google Books indisponível.');
        return getDemoBooks(query);
      }
      throw new Error('HTTP ' + res.status);
    }
    var data = await res.json();
    
    if (data.items && data.items.length) {
      var results = data.items.map(function(item) {
        var info = item.volumeInfo || {};
        var accessInfo = item.accessInfo || {};
        var pdfAvailable = accessInfo.pdf && accessInfo.pdf.isAvailable;
        var epubAvailable = accessInfo.epub && accessInfo.epub.isAvailable;
        var previewLink = info.previewLink || '';
        var downloadLink = info.downloadLink || '';
        var pdfLink = '';
        
        if (pdfAvailable) {
          pdfLink = downloadLink || previewLink;
        } else if (epubAvailable) {
          pdfLink = downloadLink || previewLink;
        } else if (previewLink) {
          pdfLink = previewLink;
        }
        
        return {
          id: item.id,
          title: info.title || 'Sem título',
          authors: info.authors || ['Autor não informado'],
          abstract: info.description || 'Sinopse indisponível.',
          url: pdfLink || previewLink || '#',
          source: pdfAvailable || epubAvailable ? '📚 PDF Disponível' : '📖 Visualizar',
          publicationYear: info.publishedDate ? info.publishedDate.substring(0, 4) : undefined,
          isPDF: pdfAvailable || epubAvailable || isPDFUrl(previewLink)
        };
      });

      // Filtra para mostrar apenas livros com conteúdo disponível
      var filteredResults = results.filter(function(book) {
        return book.isPDF && book.url !== '#';
      });

      if (filteredResults.length > 0) {
        return filteredResults;
      }
      
      // Fallback: mostra os primeiros 10 mesmo sem PDF
      return results.slice(0, 10);
    }
    return getDemoBooks(query);
  } catch (error) {
    console.error('[READ+] Erro Google Books:', error);
    return getDemoBooks(query);
  }
}

// ==================== EXPORTAÇÃO ====================
function exportResults(results, format) {
  if (format === undefined) format = 'csv';
  if (!results || !results.length) {
    alert('Nenhum resultado para exportar.');
    return;
  }

  if (format === 'csv') {
    var headers = ['Título', 'Autores', 'Resumo', 'Fonte'];
    var rows = results.map(function(r) {
      return [
        '"' + (r.title || '').replace(/"/g, '""') + '"',
        '"' + (r.authors || []).join('; ').replace(/"/g, '""') + '"',
        '"' + truncateText(r.abstract || '', 500).replace(/"/g, '""') + '"',
        '"' + (r.source || '').replace(/"/g, '""') + '"'
      ];
    });
    var csv = [headers.join(';')].concat(rows.map(function(row) { return row.join(';'); })).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'readplus-resultados-' + Date.now() + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

// ==================== RENDERIZAÇÃO DOS CARDS ====================
function renderItemsGrid(container, items, type, showExport) {
  if (showExport === undefined) showExport = true;
  container.innerHTML = '';
  if (!items || !items.length) {
    container.innerHTML = '<div class="hint-text">Nenhum resultado encontrado. Tente outro termo de busca.</div>';
    return;
  }

  if (showExport && items.length > 0) {
    var exportDiv = document.createElement('div');
    exportDiv.style.cssText = 'display:flex; justify-content:flex-end; margin-bottom:12px; gap:8px;';
    var exportBtn = document.createElement('button');
    exportBtn.className = 'export-btn';
    exportBtn.textContent = '📥 Exportar CSV';
    exportBtn.style.cssText = 'background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:6px 14px; color:#fff; cursor:pointer; font-size:0.8rem;';
    exportBtn.addEventListener('click', function() {
      var currentItems = store[type === 'article' ? 'articles' : type === 'book' ? 'books' : 'research'] || [];
      exportResults(currentItems, 'csv');
    });
    exportDiv.appendChild(exportBtn);
    container.appendChild(exportDiv);
  }

  items.forEach(function(item) {
    var wrapper = document.createElement('div');
    wrapper.className = 'virtual-row';

    var isRead = store.read[type] && store.read[type].has(item.id) || false;
    var isFavorite = store.favorites[type] && store.favorites[type].has(item.id) || false;
    var isPdf = item.isPDF || false;
    var pdfBadge = isPdf ? ' 📄' : '';

    wrapper.innerHTML = 
      '<div class="result-card" style="position:relative;">' +
        '<div style="display:flex; gap:12px; flex:1;">' +
          '<div class="checkbox ' + (isRead ? 'checked' : '') + '" data-id="' + escapeHtml(item.id) + '" data-type="' + escapeHtml(type) + '" title="Marcar como lido">' + (isRead ? '✓' : '') + '</div>' +
          '<div class="card-content" style="flex:1;">' +
            '<a href="' + sanitizeUrl(item.url) + '" target="_blank" rel="noopener noreferrer" class="card-title" title="Abrir PDF">' + escapeHtml(item.title) + pdfBadge + '</a>' +
            '<div class="card-meta">' + escapeHtml(item.source) + ' &nbsp;//&nbsp; ' + escapeHtml(item.authors.slice(0, 3).join(', ')) + (item.publicationYear ? ' · ' + item.publicationYear : '') + '</div>' +
            '<div class="card-abstract">' + escapeHtml(truncateText(item.abstract, 350)) + '</div>' +
          '</div>' +
          '<div style="display:flex; flex-direction:column; gap:6px; align-items:center; min-width:32px;">' +
            '<div class="favorite-btn ' + (isFavorite ? 'active' : '') + '" data-id="' + escapeHtml(item.id) + '" data-type="' + escapeHtml(type) + '" title="Favorito" style="cursor:pointer; font-size:1.2rem; opacity:' + (isFavorite ? 1 : 0.3) + '; transition:all 0.2s;">⭐</div>' +
            '<div class="note-btn" data-id="' + escapeHtml(item.id) + '" data-type="' + escapeHtml(type) + '" title="Adicionar nota" style="cursor:pointer; font-size:1rem; opacity:0.5; transition:all 0.2s;">📝</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var checkbox = wrapper.querySelector('.checkbox');
    checkbox.addEventListener('click', function(e) {
      var btn = e.currentTarget;
      var currentlyChecked = btn.classList.contains('checked');
      markAsReadInDB(item.id, type, !currentlyChecked);
      btn.classList.toggle('checked');
      btn.textContent = !currentlyChecked ? '✓' : '';
    });

    var favBtn = wrapper.querySelector('.favorite-btn');
    favBtn.addEventListener('click', function(e) {
      var btn = e.currentTarget;
      var currentlyFav = btn.classList.contains('active');
      toggleFavoriteInDB(item.id, type, !currentlyFav);
      btn.classList.toggle('active');
      btn.style.opacity = !currentlyFav ? '1' : '0.3';
    });

    var noteBtn = wrapper.querySelector('.note-btn');
    noteBtn.addEventListener('click', function(e) {
      var btn = e.currentTarget;
      getNoteFromDB(item.id, type).then(function(currentNote) {
        var note = prompt('Adicione uma nota sobre este item:', currentNote || '');
        if (note !== null) {
          saveNoteInDB(item.id, type, note);
          btn.style.opacity = note ? '1' : '0.5';
        }
      });
    });

    container.appendChild(wrapper);
  });
}

// ==================== RENDERIZAÇÃO DE FILTROS ====================
function renderFilters() {
  var years = '';
  for (var i = 0; i < 20; i++) {
    var y = 2026 - i;
    years += '<option value="' + y + '">' + y + '</option>';
  }
  return '<div class="filters-bar" style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; align-items:center;">' +
    '<select id="filterYear" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:8px 12px; color:#fff; font-family:inherit;"><option value="">Todos os anos</option>' + years + '</select>' +
    '<select id="filterSort" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:8px 12px; color:#fff; font-family:inherit;">' +
      '<option value="relevance">Relevância</option>' +
      '<option value="date">Data (mais recente)</option>' +
      '<option value="citations">Citações</option>' +
    '</select>' +
  '</div>';
}

// ==================== INJEÇÃO DO BUSCADOR ====================
function injectSearchTab(placeholder, searchCallback, storeKey, itemType) {
  var container = document.getElementById('mainContent');
  if (!container) return;

  store.pagination.page = 1;
  store.pagination.hasMore = true;

  container.innerHTML = 
    '<div class="search-area">' +
      '<input type="text" id="searchInputField" class="search-input" placeholder="' + placeholder + '" aria-label="Campo de busca" autocomplete="off" />' +
      '<button id="searchSubmitBtn" class="search-btn">Buscar</button>' +
    '</div>' +
    renderFilters() +
    '<div id="progressContainer" style="width:100%; height:3px; background:rgba(255,255,255,0.05); border-radius:2px; margin:8px 0; display:none;">' +
      '<div id="progressBar" style="width:0%; height:100%; background:linear-gradient(90deg, #00d4ff, #7b2cbf); border-radius:2px; transition:width 0.3s;"></div>' +
    '</div>' +
    '<div class="results-grid" id="mainResultsGrid"></div>';

  var input = document.getElementById('searchInputField');
  var btn = document.getElementById('searchSubmitBtn');
  var grid = document.getElementById('mainResultsGrid');
  var progressContainer = document.getElementById('progressContainer');
  var progressBar = document.getElementById('progressBar');

  function updateProgress(percent) {
    progressContainer.style.display = 'block';
    progressBar.style.width = Math.min(percent, 100) + '%';
    if (percent >= 100) {
      setTimeout(function() {
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
      }, 500);
    }
  }

  if (store[storeKey] && store[storeKey].length > 0) {
    renderItemsGrid(grid, store[storeKey], itemType);
    store.pagination.hasMore = store[storeKey].length >= 20;
  } else {
    grid.innerHTML = '<div class="hint-text">Digite a palavra-chave para iniciar o escaneamento cognitivo...</div>';
  }

  var exec = function(loadMore) {
    if (loadMore === undefined) loadMore = false;
    var q = input.value.trim();
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

    var yearFilter = document.getElementById('filterYear') ? document.getElementById('filterYear').value || '' : '';
    var sortFilter = document.getElementById('filterSort') ? document.getElementById('filterSort').value || 'relevance' : 'relevance';
    var filters = { year: yearFilter, sort: sortFilter };

    searchCallback(q, store.pagination.page, filters).then(function(results) {
      updateProgress(80);
      if (loadMore && store[storeKey]) {
        store[storeKey] = store[storeKey].concat(results);
      } else {
        store[storeKey] = results;
      }
      renderItemsGrid(grid, store[storeKey], itemType);
      updateProgress(100);

      store.pagination.hasMore = results.length >= 20;
      var existingBtn = document.getElementById('loadMoreBtn');
      if (existingBtn) existingBtn.remove();

      if (store.pagination.hasMore) {
        var loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'loadMoreBtn';
        loadMoreBtn.textContent = '📥 Carregar mais resultados';
        loadMoreBtn.style.cssText = 'width:100%; padding:14px; margin-top:16px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:6px; color:var(--text-secondary); cursor:pointer; font-family:"Inter",sans-serif; font-size:0.85rem; transition:all 0.3s;';
        loadMoreBtn.addEventListener('mouseenter', function() { loadMoreBtn.style.background = 'rgba(255,255,255,0.08)'; });
        loadMoreBtn.addEventListener('mouseleave', function() { loadMoreBtn.style.background = 'rgba(255,255,255,0.05)'; });
        loadMoreBtn.addEventListener('click', function() {
          store.pagination.page++;
          exec(true);
        });
        grid.parentNode.appendChild(loadMoreBtn);
      }

      btn.textContent = 'Buscar';
      btn.disabled = false;
      store.pagination.isLoading = false;
    }).catch(function(err) {
      grid.innerHTML = '<div class="hint-text">Erro ao buscar. Tente novamente.</div>';
      console.error('[READ+] Erro:', err);
      updateProgress(100);
      btn.textContent = 'Buscar';
      btn.disabled = false;
      store.pagination.isLoading = false;
    });
  };

  btn.addEventListener('click', function() { exec(false); });
  input.addEventListener('keypress', function(e) { if (e.key === 'Enter') exec(false); });
}

// ==================== ABA RESUMO ====================
async function renderSummaryTab() {
  var container = document.getElementById('mainContent');
  if (!container) return;

  if (!store.db) {
    container.innerHTML = '<div class="hint-text">Banco de dados ainda não disponível. Aguarde alguns segundos e tente novamente.</div>';
    return;
  }

  container.innerHTML = '<div class="hint-text">Sincronizando histórico de leituras...</div>';

  try {
    var allLogs = await new Promise(function(resolve) {
      var tx = store.db.transaction(['reading_log'], 'readonly');
      tx.objectStore('reading_log').getAll().onsuccess = function(e) { resolve(e.target.result || []); };
    });
    var allFavorites = await new Promise(function(resolve) {
      var tx = store.db.transaction(['favorites'], 'readonly');
      tx.objectStore('favorites').getAll().onsuccess = function(e) { resolve(e.target.result || []); };
    });
    var allNotes = await new Promise(function(resolve) {
      var tx = store.db.transaction(['notes'], 'readonly');
      tx.objectStore('notes').getAll().onsuccess = function(e) { resolve(e.target.result || []); };
    });

    var totalRead = allLogs.length;
    var totalFav = allFavorites.length;
    var totalNotes = allNotes.filter(function(n) { return n.note; }).length;

    var months = {};
    allLogs.forEach(function(log) {
      var month = new Date(log.date).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
      months[month] = (months[month] || 0) + 1;
    });
    var maxCount = Math.max.apply(null, Object.values(months));
    if (maxCount === 0) maxCount = 1;

    if (!allLogs.length && !allFavorites.length) {
      container.innerHTML = '<div class="hint-text">Nenhum material foi marcado como lido ainda.<br>Use o checkbox ⬜ nos cards para registrar suas leituras.<br><br>⭐ Marque como favorito para encontrar facilmente depois.</div>';
      return;
    }

    var monthHtml = '';
    for (var month in months) {
      if (months.hasOwnProperty(month)) {
        var count = months[month];
        var pct = (count / maxCount) * 100;
        monthHtml += '<div style="display:flex; align-items:center; gap:8px; margin:4px 0;">' +
          '<span style="min-width:90px; font-size:0.75rem; color:var(--text-secondary);">' + month + '</span>' +
          '<div style="flex:1; height:20px; background:rgba(255,255,255,0.03); border-radius:4px; overflow:hidden;">' +
            '<div style="width:' + pct + '%; height:100%; background:linear-gradient(90deg, #00d4ff, #7b2cbf); border-radius:4px; transition:width 0.5s;"></div>' +
          '</div>' +
          '<span style="font-size:0.75rem; min-width:30px; color:var(--text-secondary);">' + count + '</span>' +
        '</div>';
      }
    }

    container.innerHTML = 
      '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px,1fr)); gap:12px; margin-bottom:24px;">' +
        '<div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:16px; text-align:center; border:1px solid rgba(255,255,255,0.05);">' +
          '<div style="font-size:1.8rem; font-weight:700; color:#00d4ff;">' + totalRead + '</div>' +
          '<div style="font-size:0.75rem; color:var(--text-secondary);">Itens lidos</div>' +
        '</div>' +
        '<div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:16px; text-align:center; border:1px solid rgba(255,255,255,0.05);">' +
          '<div style="font-size:1.8rem; font-weight:700; color:#ffd700;">' + totalFav + '</div>' +
          '<div style="font-size:0.75rem; color:var(--text-secondary);">Favoritos</div>' +
        '</div>' +
        '<div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:16px; text-align:center; border:1px solid rgba(255,255,255,0.05);">' +
          '<div style="font-size:1.8rem; font-weight:700; color:#7b2cbf;">' + totalNotes + '</div>' +
          '<div style="font-size:0.75rem; color:var(--text-secondary);">Notas</div>' +
        '</div>' +
      '</div>' +
      '<div class="summary-section">' +
        '<h3 class="summary-title">📊 Leituras por Mês</h3>' +
        '<div style="margin:12px 0 24px 0;">' + monthHtml + '</div>' +
      '</div>' +
      '<div class="summary-section"><h3 class="summary-title">📄 Artigos Lidos (' + store.read.article.size + ')</h3><div class="results-grid" id="sum-article"></div></div>' +
      '<div class="summary-section"><h3 class="summary-title">📚 Livros Concluídos (' + store.read.book.size + ')</h3><div class="results-grid" id="sum-book"></div></div>' +
      '<div class="summary-section"><h3 class="summary-title">🔬 Pesquisas Mapeadas (' + store.read.research.size + ')</h3><div class="results-grid" id="sum-research"></div></div>';

    ['article', 'book', 'research'].forEach(function(type) {
      var grid = document.getElementById('sum-' + type);
      var logs = allLogs.filter(function(l) { return l.type === type; });
      if (!logs.length) {
        grid.innerHTML = '<div class="hint-text" style="padding:16px; font-size:0.82rem;">Sem registros nesta categoria.</div>';
        return;
      }
      logs.forEach(function(log) {
        var row = document.createElement('div');
        row.className = 'virtual-row';
        var note = allNotes.filter(function(n) { return n.id === log.id; })[0];
        var noteText = note ? note.note || '' : '';
        var isFav = allFavorites.some(function(f) { return f.id === log.id; });
        row.innerHTML = 
          '<div class="result-card">' +
            '<div class="card-content">' +
              '<span class="card-title" style="font-size:1rem; cursor:default;">' + escapeHtml(log.title || 'Material sem identificação') + '</span>' +
              '<div class="card-meta">' + (isFav ? '⭐ ' : '') + 'ID: ' + escapeHtml(log.id) + ' &nbsp;·&nbsp; Lido em: ' + new Date(log.date).toLocaleDateString('pt-BR') + '</div>' +
              (noteText ? '<div class="card-abstract" style="font-size:0.8rem; color:#7b2cbf; margin-top:4px;">📝 ' + escapeHtml(noteText) + '</div>' : '') +
            '</div>' +
          '</div>';
        grid.appendChild(row);
      });
    });

  } catch (err) {
    container.innerHTML = '<div class="hint-text">Erro ao carregar o histórico.</div>';
    console.error('[READ+] Erro no Resumo:', err);
  }
}

// ==================== ROUTER DE ABAS ====================
var TAB_ROUTES = {
  articles: function() {
    injectSearchTab('Buscar artigos acadêmicos em PDF...', fetchArticles, 'articles', 'article');
  },
  books: function() {
    injectSearchTab('Buscar livros disponíveis para leitura...', fetchBooks, 'books', 'book');
  },
  research: function() {
    injectSearchTab('Buscar pesquisas e estudos científicos em PDF...', fetchResearch, 'research', 'research');
  },
  summary: function() {
    renderSummaryTab();
  }
};

// ==================== INICIALIZADOR ====================
function initSystem() {
  var tabs = document.querySelectorAll('.main-tab');
  if (!tabs.length) {
    console.error('[READ+] Abas não encontradas.');
    return;
  }

  function handleTabSwitch(activeTab) {
    tabs.forEach(function(t) {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    activeTab.classList.add('active');
    activeTab.setAttribute('aria-selected', 'true');
    store.currentTab = activeTab.getAttribute('data-main');
    var route = TAB_ROUTES[store.currentTab];
    if (route) route();
  }

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() { handleTabSwitch(tab); });
  });
  handleTabSwitch(tabs[0]);

  openDB().then(function() {
    return loadInitialData();
  }).then(function() {
    console.log('[READ+] Banco sincronizado com sucesso.');
    if (store.currentTab === 'summary') renderSummaryTab();
  }).catch(function(err) {
    console.error('[READ+] Banco indisponível:', err);
  });

  // TECLAS DE ATALHO
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey && e.key === 'f') || e.key === '/') {
      e.preventDefault();
      var input = document.getElementById('searchInputField');
      if (input) { input.focus(); input.select(); }
    }
    if (e.key === 'Escape') {
      var input = document.getElementById('searchInputField');
      if (input && document.activeElement === input) { input.value = ''; input.blur(); }
    }
  });

  // MODO ESCURO/CLARO
  var themeBtn = document.createElement('button');
  themeBtn.id = 'themeToggle';
  themeBtn.textContent = '🌓';
  themeBtn.style.cssText = 'position:fixed; top:20px; right:20px; z-index:999; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:50%; width:40px; height:40px; cursor:pointer; font-size:1.2rem; transition:all 0.3s;';
  themeBtn.addEventListener('click', function() {
    document.body.classList.toggle('light-theme');
    var isDark = !document.body.classList.contains('light-theme');
    localStorage.setItem('read-theme', isDark ? 'dark' : 'light');
  });
  if (localStorage.getItem('read-theme') === 'light') document.body.classList.add('light-theme');
  document.body.appendChild(themeBtn);
}

// ==================== INICIALIZAÇÃO ====================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSystem);
} else {
  initSystem();
}

// ==================== PWA — INSTALAÇÃO ====================
var deferredPrompt;
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
  var installBtn = document.createElement('button');
  installBtn.id = 'pwa-install-btn';
  installBtn.textContent = '📲 Instalar App';
  installBtn.style.cssText = 'position:fixed; bottom:20px; right:20px; background:#00d4ff; color:#05070f; border:none; padding:12px 24px; border-radius:40px; font-weight:700; font-size:0.9rem; cursor:pointer; z-index:9999; box-shadow:0 0 30px rgba(0,212,255,0.4); display:none;';
  document.body.appendChild(installBtn);
  installBtn.addEventListener('click', function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(result) {
        console.log('[READ+] Instalação:', result.outcome);
        deferredPrompt = null;
        installBtn.style.display = 'none';
      });
    }
  });
  setTimeout(function() {
    if (deferredPrompt) installBtn.style.display = 'block';
  }, 3000);
});

window.addEventListener('appinstalled', function() {
  var btn = document.getElementById('pwa-install-btn');
  if (btn) btn.remove();
});
