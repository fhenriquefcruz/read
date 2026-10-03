import { useEffect, useState } from 'react';
import { fetchWorkRelations } from '../lib/api';
import {
  type BibliographyFormat,
  downloadBibliography,
} from '../lib/bibliography';
import type { AcademicWork, WorkRelations } from '../types';
import { ExternalLink } from './ExternalLink';
import { Icon } from './Icons';

interface WorkDetailProps {
  work: AcademicWork;
  saved: boolean;
  onClose: () => void;
  onSave: (work: AcademicWork) => void;
  onExplore: (work: AcademicWork) => void;
}

type RelationState = 'loading' | 'ready' | 'unsupported' | 'error';

function RelationGroup({
  title,
  description,
  works,
  onExplore,
}: {
  title: string;
  description: string;
  works: AcademicWork[];
  onExplore: (work: AcademicWork) => void;
}) {
  return (
    <section className="relation-group">
      <div className="relation-group__head">
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        <span>{works.length}</span>
      </div>
      {works.length ? (
        <div className="relation-list">
          {works.map((item) => (
            <button
              type="button"
              className="relation-item"
              key={item.id}
              onClick={() => onExplore(item)}
            >
              <strong>{item.title}</strong>
              <span>
                {item.year ?? 's.d.'} · {item.citationCount.toLocaleString('pt-BR')} citações
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="relation-empty">Nenhum trabalho retornado neste recorte.</p>
      )}
    </section>
  );
}

export function WorkDetail({
  work,
  saved,
  onClose,
  onSave,
  onExplore,
}: WorkDetailProps) {
  const [relations, setRelations] = useState<WorkRelations | null>(null);
  const [relationState, setRelationState] = useState<RelationState>('loading');
  const [exportMessage, setExportMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setRelations(null);
    setRelationState('loading');

    void fetchWorkRelations(work, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result) {
          setRelationState('unsupported');
          return;
        }
        setRelations(result);
        setRelationState('ready');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setRelationState('error');
      });

    return () => controller.abort();
  }, [work]);

  function exportReference(format: BibliographyFormat) {
    downloadBibliography(work, format);
    const label =
      format === 'bibtex' ? 'BibTeX' : format === 'ris' ? 'RIS' : 'CSL-JSON';
    setExportMessage(`${label} exportado.`);
  }

  return (
    <aside className="detail-panel" aria-label="Detalhes do trabalho">
      <div className="detail-panel__top">
        <div>
          <span className="eyebrow">Trabalho acadêmico</span>
          <h2>{work.title}</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhes"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="detail-authors">
        {work.authors.length ? (
          <ul className="author-list">
            {work.authors.map((author) => (
              <li key={`${author.name}-${author.orcid ?? ''}`}>
                <strong>{author.name}</strong>
                {author.institutions.length > 0 && (
                  <span>{author.institutions.join(' · ')}</span>
                )}
                {author.orcid && (
                  <ExternalLink className="author-orcid" href={author.orcid}>
                    ORCID
                  </ExternalLink>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>Autoria não informada</p>
        )}
      </div>

      <dl className="metadata-grid">
        <div>
          <dt>Ano</dt>
          <dd>{work.year ?? 'Não informado'}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{work.type}</dd>
        </div>
        <div>
          <dt>Citações</dt>
          <dd>{work.citationCount.toLocaleString('pt-BR')}</dd>
        </div>
        <div>
          <dt>Acesso</dt>
          <dd>
            {work.isOpenAccess === true
              ? 'Open Access'
              : work.isOpenAccess === false
                ? 'Fechado'
                : 'Não determinado'}
          </dd>
        </div>
        <div>
          <dt>Publicação</dt>
          <dd>{work.venue ?? 'Não informada'}</dd>
        </div>
        <div>
          <dt>DOI</dt>
          <dd>{work.doi ?? 'Não informado'}</dd>
        </div>
      </dl>

      <section className="detail-section">
        <h3>Resumo</h3>
        <p>
          {work.abstract ?? 'Esta fonte não forneceu resumo para o trabalho.'}
        </p>
      </section>

      {work.concepts.length > 0 && (
        <section className="detail-section">
          <h3>Conceitos</h3>
          <div className="chip-row">
            {work.concepts.map((concept) => (
              <span className="chip" key={concept}>
                {concept}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="detail-section">
        <div className="detail-section__head">
          <div>
            <h3>Mapa de literatura</h3>
            <p>
              Relações do grafo acadêmico do OpenAlex. Clique em um trabalho para
              continuar explorando sem voltar à busca.
            </p>
          </div>
        </div>

        {relationState === 'loading' && (
          <p className="muted" role="status">
            Carregando referências, citações e trabalhos relacionados…
          </p>
        )}
        {relationState === 'unsupported' && (
          <p className="muted">
            Este registro não possui identificador OpenAlex suficiente para
            explorar relações acadêmicas.
          </p>
        )}
        {relationState === 'error' && (
          <p className="relation-error" role="status">
            O grafo acadêmico está temporariamente indisponível. O restante dos
            metadados continua válido.
          </p>
        )}
        {relationState === 'ready' && relations && (
          <div className="relation-grid">
            <RelationGroup
              title="Referências"
              description="Trabalhos citados por este estudo"
              works={relations.references}
              onExplore={onExplore}
            />
            <RelationGroup
              title="Citado por"
              description="Trabalhos recentes que citam este estudo"
              works={relations.citedBy}
              onExplore={onExplore}
            />
            <RelationGroup
              title="Relacionados"
              description="Literatura semanticamente próxima"
              works={relations.related}
              onExplore={onExplore}
            />
          </div>
        )}
      </section>

      <section className="detail-section">
        <h3>Exportar referência</h3>
        <p className="muted">
          Formatos estruturados para Zotero, Mendeley, gestores CSL e fluxos
          bibliográficos.
        </p>
        <div className="export-actions">
          <button type="button" className="secondary-button" onClick={() => exportReference('bibtex')}>
            BibTeX
          </button>
          <button type="button" className="secondary-button" onClick={() => exportReference('ris')}>
            RIS
          </button>
          <button type="button" className="secondary-button" onClick={() => exportReference('csl-json')}>
            CSL-JSON
          </button>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {exportMessage}
        </span>
      </section>

      <section className="detail-section">
        <h3>Proveniência</h3>
        <p className="muted">
          Metadados combinados de {work.sourceProviders.join(' + ')}.
          {work.license ? ` Licença informada: ${work.license}.` : ''}
        </p>
      </section>

      <div className="detail-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => onSave(work)}
          disabled={saved}
        >
          <Icon name={saved ? 'check' : 'bookmark'} />
          {saved ? 'Salvo na biblioteca' : 'Salvar na biblioteca'}
        </button>
        <ExternalLink className="secondary-button" href={work.officialUrl}>
          <Icon name="external" /> Fonte oficial
        </ExternalLink>
        <ExternalLink className="secondary-button" href={work.pdfUrl}>
          <Icon name="file" /> PDF Open Access
        </ExternalLink>
      </div>
    </aside>
  );
}
