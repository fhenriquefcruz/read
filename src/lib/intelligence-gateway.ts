import type {
  EvidenceKind,
  EvidenceRelationType,
  WorkspaceEvidence,
  WorkspaceEvidenceRelation,
} from '../types';

export interface IntelligenceGatewayEvidence {
  id: string;
  workId: string;
  sourceTitle: string;
  sourceDoi?: string;
  kind: EvidenceKind;
  excerpt: string;
  interpretation?: string;
}

export interface IntelligenceGatewayRelation {
  id: string;
  type: EvidenceRelationType;
  evidenceIds: [string, string];
  note?: string;
}

export type IntelligenceGatewayTask =
  | 'synthesize'
  | 'compare'
  | 'identify-gaps';

export interface IntelligenceGatewayRequest {
  version: '2';
  workspaceId: string;
  question: string;
  evidence: IntelligenceGatewayEvidence[];
  relations: IntelligenceGatewayRelation[];
  requestedTasks: IntelligenceGatewayTask[];
  consent: {
    externalProcessing: true;
  };
}

export type IntelligenceClaimLayer = 'synthesis' | 'inference';

export interface IntelligenceGatewayClaim {
  id: string;
  text: string;
  layer: IntelligenceClaimLayer;
  evidenceIds: string[];
  relationIds?: string[];
}

export interface IntelligenceGatewayResponse {
  version: '2';
  claims: IntelligenceGatewayClaim[];
}

export function createGatewayRequest(
  workspaceId: string,
  question: string,
  evidence: WorkspaceEvidence[],
  externalProcessingConsent: boolean,
  relations: WorkspaceEvidenceRelation[] = [],
  requestedTasks: IntelligenceGatewayTask[] = [
    'synthesize',
    'compare',
    'identify-gaps',
  ],
): IntelligenceGatewayRequest {
  if (!externalProcessingConsent) {
    throw new Error(
      'Consentimento explícito é obrigatório para processamento externo.',
    );
  }

  const allowedEvidenceIds = new Set(evidence.map((item) => item.id));
  const validRelations = relations.filter(
    (relation) =>
      allowedEvidenceIds.has(relation.leftEvidenceId) &&
      allowedEvidenceIds.has(relation.rightEvidenceId),
  );

  return {
    version: '2',
    workspaceId,
    question,
    evidence: evidence.map((item) => ({
      id: item.id,
      workId: item.workId,
      sourceTitle: item.sourceTitle,
      sourceDoi: item.sourceDoi,
      kind: item.kind,
      excerpt: item.excerpt,
      interpretation: item.interpretation || undefined,
    })),
    relations: validRelations.map((relation) => ({
      id: relation.id,
      type: relation.type,
      evidenceIds: [relation.leftEvidenceId, relation.rightEvidenceId],
      note: relation.note || undefined,
    })),
    requestedTasks: [...new Set(requestedTasks)],
    consent: { externalProcessing: true },
  };
}

export function validateGroundedGatewayResponse(
  value: unknown,
  allowedEvidenceIds: Iterable<string>,
  allowedRelationIds: Iterable<string> = [],
): IntelligenceGatewayResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Resposta de inteligência inválida.');
  }

  const response = value as Partial<IntelligenceGatewayResponse>;
  if (response.version !== '2' || !Array.isArray(response.claims)) {
    throw new Error('Contrato de inteligência incompatível.');
  }

  const allowedEvidence = new Set(allowedEvidenceIds);
  const allowedRelations = new Set(allowedRelationIds);

  const claims = response.claims.map((raw) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Claim inválida na resposta de inteligência.');
    }

    const claim = raw as Partial<IntelligenceGatewayClaim>;
    if (
      !claim.id ||
      !claim.text?.trim() ||
      (claim.layer !== 'synthesis' && claim.layer !== 'inference') ||
      !Array.isArray(claim.evidenceIds) ||
      claim.evidenceIds.length === 0
    ) {
      throw new Error('Toda claim deve ser textual, tipada e grounded.');
    }

    const evidenceIds = [...new Set(claim.evidenceIds)];
    if (evidenceIds.some((id) => !allowedEvidence.has(id))) {
      throw new Error(
        'A resposta citou evidência inexistente no contexto enviado.',
      );
    }

    const relationIds = Array.isArray(claim.relationIds)
      ? [...new Set(claim.relationIds)]
      : undefined;
    if (relationIds?.some((id) => !allowedRelations.has(id))) {
      throw new Error(
        'A resposta citou relação analítica inexistente no contexto enviado.',
      );
    }

    return {
      id: claim.id,
      text: claim.text.trim(),
      layer: claim.layer,
      evidenceIds,
      relationIds,
    };
  });

  return { version: '2', claims };
}
