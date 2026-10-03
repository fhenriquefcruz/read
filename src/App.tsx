import { useEffect, useMemo, useState } from 'react';
import { DiscoverView } from './views/DiscoverView';
import { LibraryView } from './views/LibraryView';
import { WorkspaceView } from './views/WorkspaceView';
import { KnowledgeView } from './views/KnowledgeView';
import { WorkDetail } from './components/WorkDetail';
import { Icon, type IconName } from './components/Icons';
import { libraryStore } from './lib/storage';
import type { AcademicWork, LibraryEntry } from './types';

type View = 'discover' | 'library' | 'workspaces' | 'knowledge';
type Theme = 'light' | 'dark';

const navigation: Array<{ id: View; label: string; icon: IconName }> = [
  { id: 'discover', label: 'Descobrir', icon: 'search' },
  { id: 'library', label: 'Biblioteca', icon: 'library' },
  { id: 'workspaces', label: 'Pesquisas', icon: 'workspace' },
  { id: 'knowledge', label: 'Conhecimento', icon: 'network' },
];

function initialTheme(): Theme {
  const stored = localStorage.getItem('readplus:theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export default function App() {
  const [view, setView] = useState<View>('discover');
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [selectedWork, setSelectedWork] = useState<AcademicWork | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('readplus:theme', theme);
  }, [theme]);

  useEffect(() => {
    void libraryStore
      .list()
      .then((items) =>
        setLibrary(
          items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        ),
      );
  }, []);

  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setView('discover');
        window.setTimeout(
          () => document.getElementById('global-search')?.focus(),
          0,
        );
      }
      if (
        event.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (event.target as HTMLElement)?.tagName,
        )
      ) {
        event.preventDefault();
        setView('discover');
        window.setTimeout(
          () => document.getElementById('global-search')?.focus(),
          0,
        );
      }
      if (event.key === 'Escape' && selectedWork) setSelectedWork(null);
    }

    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [selectedWork]);

  const savedIds = useMemo(
    () => new Set(library.map((entry) => entry.id)),
    [library],
  );

  async function saveWork(work: AcademicWork) {
    if (savedIds.has(work.id)) return;
    const now = new Date().toISOString();
    const entry: LibraryEntry = {
      id: work.id,
      work,
      status: 'saved',
      tags: [],
      note: '',
      createdAt: now,
      updatedAt: now,
    };
    await libraryStore.save(entry);
    setLibrary((current) => [entry, ...current]);
  }

  async function importWorks(
    works: AcademicWork[],
  ): Promise<{ added: number; skipped: number }> {
    const currentIds = new Set(library.map((entry) => entry.id));
    const now = new Date().toISOString();
    const additions: LibraryEntry[] = [];

    for (const work of works) {
      if (currentIds.has(work.id)) continue;
      currentIds.add(work.id);
      additions.push({
        id: work.id,
        work,
        status: 'saved',
        tags: [],
        note: '',
        createdAt: now,
        updatedAt: now,
      });
    }

    await Promise.all(additions.map((entry) => libraryStore.save(entry)));
    if (additions.length) {
      setLibrary((current) => [...additions, ...current]);
    }

    return { added: additions.length, skipped: works.length - additions.length };
  }

  async function updateEntry(entry: LibraryEntry) {
    setLibrary((current) =>
      current
        .map((item) => (item.id === entry.id ? entry : item))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );

    try {
      await libraryStore.save(entry);
    } catch (error) {
      const stored = await libraryStore.list();
      setLibrary(
        stored.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      throw error;
    }
  }

  async function removeEntry(id: string) {
    await libraryStore.remove(id);
    setLibrary((current) => current.filter((entry) => entry.id !== id));
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <button
          className="brand"
          type="button"
          onClick={() => setView('discover')}
          aria-label="Ir para descoberta"
        >
          <span className="brand-mark">R+</span>
          <span className="brand-copy">
            <strong>READ+</strong>
            <small>Research workspace</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="Navegação principal">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={
                view === item.id ? 'nav-item nav-item--active' : 'nav-item'
              }
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'library' && library.length > 0 && (
                <span className="nav-count">{library.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="shortcut-hint">
            <kbd>⌘/Ctrl</kbd>
            <kbd>K</kbd>
            <span>Buscar</span>
          </div>
          <button
            className="theme-button"
            type="button"
            onClick={() =>
              setTheme((current) => (current === 'light' ? 'dark' : 'light'))
            }
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} />
            {theme === 'light' ? 'Modo escuro' : 'Modo claro'}
          </button>
        </div>
      </aside>

      <div className="app-content">
        {view === 'discover' && (
          <DiscoverView
            savedIds={savedIds}
            onSelect={setSelectedWork}
            onSave={saveWork}
          />
        )}
        {view === 'library' && (
          <LibraryView
            entries={library}
            onUpdate={updateEntry}
            onRemove={removeEntry}
            onSelect={setSelectedWork}
            onImportWorks={importWorks}
          />
        )}
        {view === 'workspaces' && (
          <WorkspaceView
            library={library}
            onSelect={setSelectedWork}
            onSaveWork={saveWork}
          />
        )}
        {view === 'knowledge' && <KnowledgeView library={library} />}
      </div>

      {selectedWork && (
        <>
          <button
            className="detail-backdrop"
            type="button"
            aria-label="Fechar painel de detalhes"
            onClick={() => setSelectedWork(null)}
          />
          <WorkDetail
            work={selectedWork}
            saved={savedIds.has(selectedWork.id)}
            onClose={() => setSelectedWork(null)}
            onSave={saveWork}
            onExplore={setSelectedWork}
          />
        </>
      )}
    </div>
  );
}
