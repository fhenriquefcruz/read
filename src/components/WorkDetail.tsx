import type { AcademicWork } from '../types';
import { safeExternalUrl } from '../lib/url';
import { Icon } from './Icons';
import { ExternalLink } from './ExternalLink';

interface WorkDetailProps {
  work: AcademicWork;
  saved: boolean;
  onClose: () => void;
  onSave: (work: AcademicWork) => void;
}

function authorsLabel(work: AcademicWork): string {
  if (!work.authors.length) return 'Autoria não informada';
  return work.authors.map((author) => author.name).join(', ');
}

export function WorkDetail({ work, saved, onClose, onSave }: WorkDetailProps) {
  const officialUrl = safeExternalUrl(work.officialUrl);
  const pdfUrl = safeExternalUrl(work.pdfUrl);

  return (
    <aside className="detail-panel" aria-label="Detalhes do trabalho">
      <div className="detail-panel__top">
        <div>
          <span className="eyebrow">Trabalho acadêmico</span>
          <h2>{work.title}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar detalhes">
          <Icon name="close" />
        </button>
      </div>

      <p className="detail-authors">{authorsLabel(work)}</p>

      <dl className="metadata-grid">
        <div><dt>Ano</dt><dd>{work.year ?? 'Não informado'}</dd></div>
        <div><dt>Tipo</dt><dd>{work.type}</dd></div>
        <div><dt>Citações</dt><dd>{work.citationCount.toLocaleString('pt-BR')}</dd></div>
        <div><dt>Acesso</dt><dd>{work.isOpenAccess === true ? 'Open Access' : work.isOpenAccess === false ? 'Fechado' : 'Não determinado'}</dd></div>
        <div><dt>Publicação</dt><dd>{work.venue ?? 'Não informada'}</dd></div>
        <div><dt>DOI</dt><dd>{work.doi ?? 'Não informado'}</dd></div>
      </dl>

      <section className="detail-section">
        <h3>Resumo</h3>
        <p>{work.abstract ?? 'Esta fonte não forneceu resumo para o trabalho.'}</p>
      </section>

      {work.concepts.length > 0 && (
        <section className="detail-section">
          <h3>Conceitos</h3>
          <div className="chip-row">
            {work.concepts.map((concept) => <span className="chip" key={concept}>{concept}</span>)}
          </div>
        </section>
      )}

      <section className="detail-section">
        <h3>Proveniência</h3>
        <p className="muted">
          Metadados combinados de {work.sourceProviders.join(' + ')}.
          {work.license ? ` Licença informada: ${work.license}.` : ''}
        </p>
      </section>

      <div className="detail-actions">
        <button className="primary-button" type="button" onClick={() => onSave(work)} disabled={saved}>
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
