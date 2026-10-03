import { describe, expect, it, vi } from 'vitest';
import {
  appendQueryRun,
  compareQueryRuns,
  latestQueryRun,
  snapshotSearchResponse,
} from '../src/lib/continuous-research';
import type {
  AcademicWork,
  SearchResponse,
  WorkspaceQuery,
  WorkspaceQueryRun,
} from '../src/types';

vi.stubGlobal('crypto', {
  randomUUID: () => 'run-id',
});

const work = (id: string, title: string): AcademicWork => ({
  id,
  title,
  authors: [],
  type: 'article',
  citationCount: 0,
  concepts: [],
  isOpenAccess: null,
  providerIds: {},
  sourceProviders: ['OpenAlex'],
});

const response = (works: AcademicWork[]): SearchResponse => ({
  works,
  providers: [],
  fromCache: false,
});

const query: WorkspaceQuery = {
  id: 'q1',
  raw: 'public administration',
  filters: { sort: 'relevance' },
  createdAt: '2026-10-03T10:00:00.000Z',
};

describe('continuous research snapshots', () => {
  it('cria snapshot compacto e não copia o artigo completo', () => {
    const run = snapshotSearchResponse(
      response([
        {
          ...work('w1', 'Study One'),
          doi: '10.1000/one',
          year: 2025,
          abstract: 'Large abstract that must not be persisted in query runs.',
        },
      ]),
      '2026-10-03T11:00:00.000Z',
    );

    expect(run.results).toEqual([
      {
        id: 'w1',
        title: 'Study One',
        doi: '10.1000/one',
        year: 2025,
      },
    ]);
    expect(run).not.toHaveProperty('abstract');
  });

  it('primeira execução estabelece baseline sem chamar tudo de novo', () => {
    const run = snapshotSearchResponse(
      response([work('w1', 'Study One')]),
      '2026-10-03T11:00:00.000Z',
    );

    const diff = compareQueryRuns(undefined, run);

    expect(diff.isBaseline).toBe(true);
    expect(diff.newResults).toEqual([]);
  });

  it('detecta novas identidades independentemente da ordem do ranking', () => {
    const previous: WorkspaceQueryRun = {
      id: 'old',
      executedAt: '2026-10-03T10:00:00.000Z',
      resultCount: 2,
      results: [
        { id: 'w1', title: 'Study One' },
        { id: 'w2', title: 'Study Two' },
      ],
    };
    const current: WorkspaceQueryRun = {
      id: 'new',
      executedAt: '2026-10-03T11:00:00.000Z',
      resultCount: 3,
      results: [
        { id: 'w2', title: 'Study Two' },
        { id: 'w1', title: 'Study One' },
        { id: 'w3', title: 'Study Three' },
      ],
    };

    const diff = compareQueryRuns(previous, current);

    expect(diff.isBaseline).toBe(false);
    expect(diff.newResults.map((item) => item.id)).toEqual(['w3']);
    expect(diff.disappearedResults).toEqual([]);
  });

  it('mantém histórico limitado e mais recente primeiro', () => {
    let current = query;

    for (let index = 0; index < 10; index += 1) {
      current = appendQueryRun(current, {
        id: `run-${index}`,
        executedAt: `2026-10-03T${String(index).padStart(2, '0')}:00:00.000Z`,
        resultCount: index,
        results: [],
      });
    }

    expect(current.runs).toHaveLength(8);
    expect(latestQueryRun(current)?.id).toBe('run-9');
    expect(current.resultCount).toBe(9);
  });
});
