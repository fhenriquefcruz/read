import type {
  AcademicWork,
  SearchResponse,
  WorkspaceQuery,
  WorkspaceQueryRun,
  WorkspaceQueryResultRef,
} from '../types';

const MAX_RESULTS_PER_RUN = 60;
const MAX_RUNS_PER_QUERY = 8;

export interface QueryRunDiff {
  run: WorkspaceQueryRun;
  previousRun?: WorkspaceQueryRun;
  isBaseline: boolean;
  newResults: WorkspaceQueryResultRef[];
  disappearedResults: WorkspaceQueryResultRef[];
}

function resultRef(work: AcademicWork): WorkspaceQueryResultRef {
  return {
    id: work.id,
    title: work.title,
    doi: work.doi,
    year: work.year,
  };
}

function runId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `query-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function snapshotSearchResponse(
  response: SearchResponse,
  executedAt = new Date().toISOString(),
): WorkspaceQueryRun {
  return {
    id: runId(),
    executedAt,
    resultCount: response.works.length,
    results: response.works.slice(0, MAX_RESULTS_PER_RUN).map(resultRef),
  };
}

export function compareQueryRuns(
  previousRun: WorkspaceQueryRun | undefined,
  currentRun: WorkspaceQueryRun,
): QueryRunDiff {
  if (!previousRun) {
    return {
      run: currentRun,
      isBaseline: true,
      newResults: [],
      disappearedResults: [],
    };
  }

  const previousById = new Map(
    previousRun.results.map((item) => [item.id, item]),
  );
  const currentById = new Map(
    currentRun.results.map((item) => [item.id, item]),
  );

  return {
    run: currentRun,
    previousRun,
    isBaseline: false,
    newResults: currentRun.results.filter(
      (item) => !previousById.has(item.id),
    ),
    disappearedResults: previousRun.results.filter(
      (item) => !currentById.has(item.id),
    ),
  };
}

export function appendQueryRun(
  query: WorkspaceQuery,
  run: WorkspaceQueryRun,
): WorkspaceQuery {
  const runs = [run, ...(query.runs ?? [])]
    .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
    .slice(0, MAX_RUNS_PER_QUERY);

  return {
    ...query,
    resultCount: run.resultCount,
    runs,
  };
}

export function latestQueryRun(
  query: WorkspaceQuery,
): WorkspaceQueryRun | undefined {
  return query.runs?.[0];
}

export function resultIsAlreadyInCorpus(
  result: WorkspaceQueryResultRef,
  corpusIds: Iterable<string>,
): boolean {
  return new Set(corpusIds).has(result.id);
}
