// app.js – Motor de busca e renderização dinâmica

(function() {
  'use strict';

  // DOM references
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const resultsGrid = document.getElementById('resultsGrid');
  const statusMessage = document.getElementById('statusMessage');
  const themeToggle = document.getElementById('themeToggle');

  // Estado
  let currentData = [];

  // -------------------- FUNÇÕES AUXILIARES --------------------
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // -------------------- RENDERIZAÇÃO DOS CARDS --------------------
  function renderCards(data, searchTerm) {
    resultsGrid.innerHTML = '';

    if (!data || data.length === 0) {
      // Estado vazio
      resultsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>Nenhum material encontrado</p>
          <p class="empty-suggestion">Tente outras palavras‑chave ou ajuste os filtros.</p>
        </div>
      `;
      statusMessage.textContent = 'Nenhum resultado encontrado.';
      return;
    }

    // Atualiza mensagem de status
    const term = searchTerm ? ` para "${escapeHtml(searchTerm)}"` : '';
    statusMessage.textContent = `${data.length} resultado${data.length > 1 ? 's' : ''} encontrado${data.length > 1 ? 's' : ''}${term}.`;

    // Cria os cards
    data.forEach(item => {
      const card = document.createElement('div');
      card.className = 'result-card';

      // Ao clicar no card, abre o PDF em nova aba (se houver link)
      card.addEventListener('click', function(e) {
        // Evita que cliques nos botões internos (futuros) disparem duas vezes
        if (e.target.closest('button')) return;
        if (item.link_pdf) {
          window.open(item.link_pdf, '_blank');
        } else {
          alert('PDF não disponível para este item.');
        }
      });

      // Monta o conteúdo do card
      card.innerHTML = `
        <div class="card-title">${escapeHtml(item.titulo)}</div>
        <div class="card-meta">
          <span>${escapeHtml(item.autores || 'Autor desconhecido')}</span>
          <span class="year">${item.ano || '–'}</span>
          <span class="citations">⭐ ${item.citacoes || 0} citações</span>
        </div>
        <div class="card-footer">
          <span>${escapeHtml(item.fonte || 'Fonte não informada')}</span>
          <span class="pdf-hint">📄 Abrir PDF</span>
        </div>
      `;

      resultsGrid.appendChild(card);
    });
  }

  // -------------------- FUNÇÃO DE BUSCA (FILTER) --------------------
  function performSearch() {
    const query = searchInput.value.trim().toLowerCase();

    // Estado de carregamento no botão
    searchBtn.classList.add('loading');
    searchBtn.disabled = true;

    // Simula um pequeno delay para feedback visual (300ms)
    setTimeout(() => {
      let filtered = [];

      if (query === '') {
        // Se busca vazia, exibe todos os dados
        filtered = currentData;
      } else {
        // Filtra por título, autores ou ano (como string)
        filtered = currentData.filter(item => {
          const titleMatch = item.titulo.toLowerCase().includes(query);
          const authorMatch = item.autores.toLowerCase().includes(query);
          const yearMatch = String(item.ano).includes(query);
          return titleMatch || authorMatch || yearMatch;
        });
      }

      // Renderiza os resultados
      renderCards(filtered, query);

      // Restaura o botão
      searchBtn.classList.remove('loading');
      searchBtn.disabled = false;
    }, 300); // 300ms de "carregamento" rápido
  }

  // -------------------- CARREGAR DADOS INICIAIS --------------------
  function loadData() {
    // A variável ACADEMIC_DATA vem do arquivo data.js (global)
    if (typeof ACADEMIC_DATA !== 'undefined' && Array.isArray(ACADEMIC_DATA)) {
      currentData = ACADEMIC_DATA;
      renderCards(currentData, '');
      statusMessage.textContent = `${currentData.length} itens disponíveis.`;
    } else {
      // Fallback caso data.js não tenha carregado
      console.error('Dados não encontrados. Verifique o arquivo data.js.');
      statusMessage.textContent = 'Erro ao carregar os dados.';
      resultsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <p>Não foi possível carregar a base de dados.</p>
        </div>
      `;
    }
  }

  // -------------------- TEMA (Dark Mode) --------------------
  themeToggle.addEventListener('click', function() {
    document.body.classList.toggle('light-theme');
    const isDark = !document.body.classList.contains('light-theme');
    document.documentElement.style.setProperty('--bg-deep', isDark ? '#0F172A' : '#F8FAFC');
    document.documentElement.style.setProperty('--text-primary', isDark ? '#F1F5F9' : '#0F172A');
    document.documentElement.style.setProperty('--text-secondary', isDark ? '#94A3B8' : '#475569');
    document.documentElement.style.setProperty('--text-muted', isDark ? '#64748B' : '#94A3B8');
  });

  // -------------------- EVENT LISTENERS --------------------
  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      performSearch();
    }
  });

  // -------------------- INICIALIZAÇÃO --------------------
  document.addEventListener('DOMContentLoaded', function() {
    loadData();
  });

})();
