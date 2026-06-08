// ==================== ESTADO CENTRALIZADO PROTEGIDO ====================
const store = {
  articles: [], books: [], research: [],
  read: { article: new Set(), book: new Set(), research: new Set() },
  favorites: { article: [], book: [], research: [] },
  notes: new Map(),
  tags: new Map(),
  collections: [],
  zettels: [],
  backlinks: new Map(), // Chave: Zettel ID -> Valor: Set de IDs de notas que o referenciam
  studyLog: [],
  userProfile: { name: "Pesquisador", xp: 0, level: 0, badges: [] },
  currentTab: 'articles',
  db: null
};

// ==================== SANITIZAÇÃO COMPLETA CONTRA XSS ====================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

// ==================== UNIFICAÇÃO INDEXEDDB ====================
async function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ReadPlusDB', 12);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const stores = ['articles','books','research','notes','collections','tags','favorites','reading_log','study_log','settings','zettels','backlinks'];
      stores.forEach(s => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'settings' ? 'key' : 'id' });
      });
    };
    req.onsuccess = (e) => {
      store.db = e.target.result;
      resolve(e.target.result);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveToDB(storeName, item) {
  return new Promise((resolve, reject) => {
    const tx = store.db.transaction([storeName], 'readwrite');
    const s = tx.objectStore(storeName);
    const req = s.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(tx.error);
  });
}

// ==================== MOTOR DE RECONSTRUÇÃO DE BACKLINKS ====================
function rebuildAllBacklinks() {
  store.backlinks.clear();
  // Inicializa mapas vazios
  store.zettels.forEach(z => store.backlinks.set(z.id, new Set()));
  
  // Analisa links do tipo [[ID ou Título]]
  const linkRegex = /\[\[(.*?)\]\]/g;
  
  store.zettels.forEach(sourceZettel => {
    let match;
    const content = sourceZettel.content || '';
    while ((match = linkRegex.exec(content)) !== null) {
      const targetIdentifier = match[1].trim();
      // Encontra a nota de destino por ID ou correspondência exata de Título
      const targetZettel = store.zettels.find(z => z.id === targetIdentifier || z.title.toLowerCase() === targetIdentifier.toLowerCase());
      
      if (targetZettel && targetZettel.id !== sourceZettel.id) {
        if (!store.backlinks.has(targetZettel.id)) {
          store.backlinks.set(targetZettel.id, new Set());
        }
        store.backlinks.get(targetZettel.id).add(sourceZettel.id);
      }
    }
  });
}

// ==================== PARSER MARKDOWN SIMPLIFICADO ====================
function parseMarkdown(text) {
  let html = escapeHtml(text);
  
  // Parser de Links Zettelkasten Dinâmicos [[id|Rótulo]] ou [[id]]
  html = html.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
    const parts = p1.split('|');
    const targetId = parts[0].trim();
    const label = parts[1] ? parts[1].trim() : targetId;
    
    const targetZettel = store.zettels.find(z => z.id === targetId || z.title.toLowerCase() === targetId.toLowerCase());
    if (targetZettel) {
      return `<button class="backlink-item" onclick="loadZettelById('${targetZettel.id}')" aria-label="Navegar para nota ${escapeHtml(targetZettel.title)}">${escapeHtml(label)}</button>`;
    }
    return `<span style="opacity:0.5; text-decoration:line-through;">[[${escapeHtml(p1)}]]</span>`;
  });

  // Estilos Markdown Básicos adicionais
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ==================== ENGINE DE VIRTUALIZAÇÃO NATIVA ====================
function virtualizeList(container, items, renderRowItemFunc) {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="no-results">🔍 Nenhum registro encontrado.</div>';
    return;
  }

  // Instancia elementos leves de sustentação (Skeleton Trackers)
  items.forEach((item, index) => {
    const rowWrapper = document.createElement('div');
    rowWrapper.style.minHeight = '120px';
    rowWrapper.style.contentVisibility = 'auto';
    rowWrapper.setAttribute('data-index', index);
    
    // Configura Intersection Observer para carregar conteúdo real sob demanda física
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          rowWrapper.innerHTML = renderRowItemFunc(item);
          observer.unobserve(rowWrapper); // Evita re-trabalho após renderização inicial
        }
      });
    }, { root: container, rootMargin: '100px' });

    observer.observe(rowWrapper);
    container.appendChild(rowWrapper);
  });
}

// ==================== MONTAGEM DO MÓDULO MIND FORGE (ZETTELKASTEN) ====================
function injectMindForgeModule() {
  const container = document.getElementById('mainContent');
  container.innerHTML = `
    <div class="sub-tabs" role="tablist" aria-label="Sub-menus do Mind Forge">
      <button class="sub-tab active" id="subtab-view" role="tab" aria-selected="true">Visualizar Notas</button>
      <button class="sub-tab" id="subtab-create" role="tab" aria-selected="false">Criar Nota</button>
    </div>
    
    <div id="mindforge-view-panel" class="sub-content active">
      <input type="text" id="zettelSearch" class="search-input" placeholder="Filtrar notas por termo..." style="width:100%; margin-bottom:15px;" aria-label="Filtrar notas">
      <div class="results-grid" id="zettelVirtualList"></div>
    </div>

    <div id="mindforge-create-panel" class="sub-content">
      <input type="text" id="zettelTitle" class="search-input" placeholder="Título da Nota" style="width:100%; margin-bottom:10px;" aria-label="Título da nota Zettel">
      <div class="zettel-editor-container">
        <div>
          <label for="zettelRawContent" class="card-meta">Conteúdo (Suporta Markdown e [[Links]]):</label>
          <textarea id="zettelRawContent" class="zettel-textarea" aria-label="Editor de texto Markdown"></textarea>
        </div>
        <div>
          <span class="card-meta">Live Preview:</span>
          <div id="zettelLivePreview" class="zettel-preview"></div>
        </div>
      </div>
      <button id="saveZettelBtn" class="search-btn" style="margin-top:15px;">Salvar Nota Física</button>
      
      <div class="backlinks-container">
        <h4>Conexões de Entrada (Backlinks)</h4>
        <div id="zettelBacklinksContainer"><span class="card-meta">Nenhuma nota aponta para este zettel.</span></div>
      </div>
    </div>
  `;

  // Inicializa Listeners de Controle do Editor
  setupMindForgeListeners();
  renderZettelList();
}

function setupMindForgeListeners() {
  const viewTab = document.getElementById('subtab-view');
  const createTab = document.getElementById('subtab-create');
  const viewPanel = document.getElementById('mindforge-view-panel');
  const createPanel = document.getElementById('mindforge-create-panel');
  const tx = document.getElementById('zettelRawContent');
  const prev = document.getElementById('zettelLivePreview');
  const saveBtn = document.getElementById('saveZettelBtn');
  const searchInput = document.getElementById('zettelSearch');

  viewTab.addEventListener('click', () => {
    viewTab.classList.add('active'); createTab.classList.remove('active');
    viewPanel.classList.add('active'); createPanel.classList.remove('active');
    renderZettelList();
  });

  createTab.addEventListener('click', () => {
    createTab.classList.add('active'); viewTab.classList.remove('active');
    createPanel.classList.add('active'); viewPanel.classList.remove('active');
  });

  tx.addEventListener('input', () => {
    prev.innerHTML = parseMarkdown(tx.value);
  });

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = store.zettels.filter(z => z.title.toLowerCase().includes(term) || z.content.toLowerCase().includes(term));
    renderZettelVirtualization(filtered);
  });

  saveBtn.addEventListener('click', async () => {
    const title = document.getElementById('zettelTitle').value.trim();
    const content = tx.value;
    if(!title || !content) return alert('Por favor, preencha o título e conteúdo.');

    const newZettel = { id: stableHash(title), title, content, date: new Date().toISOString() };
    store.zettels = store.zettels.filter(z => z.id !== newZettel.id);
    store.zettels.push(newZettel);

    await saveToDB('zettels', newZettel);
    rebuildAllBacklinks();
    alert('Nota armazenada com sucesso no Mind Forge!');
    viewTab.click();
  });
}

function renderZettelList() {
  rebuildAllBacklinks();
  renderZettelVirtualization(store.zettels);
}

function renderZettelVirtualization(items) {
  const listContainer = document.getElementById('zettelVirtualList');
  if(!listContainer) return;

  virtualizeList(listContainer, items, (zettel) => {
    return `
      <div class="result-card" style="width:100%;">
        <div class="card-content">
          <button class="card-title" style="background:none; border:none; text-align:left; cursor:pointer;" onclick="loadZettelById('${zettel.id}')">
            ${escapeHtml(zettel.title)}
          </button>
          <div class="card-meta">Identificador Único: [[${escapeHtml(zettel.id)}]] · Modificado em: ${new Date(zettel.date).toLocaleDateString()}</div>
          <div class="card-abstract">${parseMarkdown(zettel.content.substring(0, 140))}...</div>
        </div>
      </div>
    `;
  });
}

// Navegação direta acionada por clique em backlinks ou lista
window.loadZettelById = function(id) {
  const zettel = store.zettels.find(z => z.id === id);
  if(!zettel) return;

  document.getElementById('subtab-create').click();
  document.getElementById('zettelTitle').value = zettel.title;
  
  const tx = document.getElementById('zettelRawContent');
  tx.value = zettel.content;
  document.getElementById('zettelLivePreview').innerHTML = parseMarkdown(zettel.content);

  // Carrega Backlinks na UI
  const blContainer = document.getElementById('zettelBacklinksContainer');
  blContainer.innerHTML = '';
  const incomingLinks = store.backlinks.get(zettel.id);

  if (incomingLinks && incomingLinks.size > 0) {
    incomingLinks.forEach(sourceId => {
      const sourceZettel = store.zettels.find(z => z.id === sourceId);
      if (sourceZettel) {
        const btn = document.createElement('button');
        btn.className = 'backlink-item';
        btn.textContent = sourceZettel.title;
        btn.setAttribute('aria-label', `Nota de origem: ${sourceZettel.title}`);
        btn.onclick = () => loadZettelById(sourceId);
        blContainer.appendChild(btn);
      }
    });
  } else {
    blContainer.innerHTML = '<span class="card-meta">Nenhuma nota aponta para este zettel.</span>';
  }
};

// ==================== INICIALIZADOR DE AMBIENTE INTERNO ====================
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  
  // Mock ou carregamento de banco real
  const tx = store.db.transaction(['zettels'], 'readonly');
  store.zettels = await new Promise(res => tx.objectStore('zettels').getAll().onsuccess = e => res(e.target.result || []));
  rebuildAllBacklinks();

  // Gerenciamento de Abas Principais
  const tabs = document.querySelectorAll('.main-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      
      const target = tab.getAttribute('data-main');
      if (target === 'brain') {
        injectMindForgeModule();
      } else {
        document.getElementById('mainContent').innerHTML = `<div class="no-results">Painel de ${target} carregado. Pronto para buscas.</div>`;
      }
    });
  });

  // Carrega módulo inicial default
  injectMindForgeModule();
});
