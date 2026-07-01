// ==================== MOTOR DE BUSCA — GOOGLE BOOKS (COM CHAVE) ====================
async function fetchBooks(query) {
  const API_KEY = 'bqvmu2hqycd24UJjQOIxI3'; // sua chave
  const directUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&printType=books&key=${API_KEY}`;

  try {
    const res = await fetch(directUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.items?.length) {
      return data.items.map(item => ({
        id: item.id,
        title: item.volumeInfo?.title || 'Sem título',
        authors: item.volumeInfo?.authors || ['Autor não informado'],
        abstract: item.volumeInfo?.description || 'Sinopse indisponível.',
        url: item.volumeInfo?.previewLink || item.volumeInfo?.infoLink || '#',
        source: 'Google Books'
      }));
    }
    return [];
  } catch (error) {
    console.error('[READ+] Erro no Google Books:', error);
    // Fallback: OpenAlex (já existe)
    return fallbackBooks(query);
  }
}

// Fallback para OpenAlex (sem chave)
async function fallbackBooks(query) {
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
