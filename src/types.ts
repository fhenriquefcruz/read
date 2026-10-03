export type ProviderName = 'OpenAlex' | 'Crossref' | 'Imported';

export interface WorkAuthor {
  name: string;
  orcid?: string;
  institutions: string[];
}

export interface AcademicWork {
  id: string;
  title: string;
  authors: WorkAuthor[];
  year?: number;
  abstract?: string;
  doi?: string;
  type: string;
  venue?: string;
  publisher?: string;
  language?: string;
  citationCount: number;
  concepts: string[];
  isOpenAccess: boolean | null;
  oaStatus?: string;
  officialUrl?: string;
  pdfUrl?: string;
  license?: string;
  providerIds: Partial<Record<ProviderName, string>>;
  sourceProviders: ProviderName[];
  rankScore?: number;
  rankReasons?: string[];
}

export interface SearchFilters {
  yearFrom?: number;
  yearTo?: number;
  type?: string;
  openAccess?: boolean;
  language?: string;
  author?: string;
  sort: 'relevance' | 'recent' | 'citations';
}

export interface ParsedQuery {
  freeText: string;
  filters: SearchFilters;
  raw: string;
}

export interface ProviderStatus {
  provider: ProviderName;
  ok: boolean;
  count: number;
  latencyMs: number;
  message?: string;
}

export interface SearchResponse {
  works: AcademicWork[];
  providers: ProviderStatus[];
  fromCache: boolean;
}

export interface WorkRelations {
  references: AcademicWork[];
  citedBy: AcademicWork[];
  related: AcademicWork[];
}

export type LibraryStatus =
  | 'saved'
  | 'to-read'
  | 'reading'
  | 'read'
  | 'important'
  | 'archived';

export interface LibraryEntry {
  id: string;
  work: AcademicWork;
  status: LibraryStatus;
  tags: string[];
  collection?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type EvidenceKind =
  | 'finding'
  | 'method'
  | 'limitation'
  | 'definition'
  | 'quote';

export interface WorkspaceEvidence {
  id: string;
  workId: string;
  sourceTitle: string;
  sourceDoi?: string;
  kind: EvidenceKind;
  excerpt: string;
  interpretation: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  title: string;
  question: string;
  workIds: string[];
  queries: string[];
  evidence?: WorkspaceEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeNote {
  id: string;
  title: string;
  content: string;
  workIds: string[];
  workspaceId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
