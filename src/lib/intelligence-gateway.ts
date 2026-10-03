import type { EvidenceKind, WorkspaceEvidence } from '../types';

export interface IntelligenceGatewayEvidence {
  id: string;
  workId: string;
  sourceTitle: string;
  sourceDoi?: string;
  kind: EvidenceKind;
  excerpt: string;
  interpretation?: string;
}

export interface IntelligenceGatewayRequest {
  version: '1';
  workspaceId: string;
  question: string;
  evidence: IntelligenceGatewayEvidence[];
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
}

export interface IntelligenceGatewayResponse {
  version: '1';
  claims: IntelligenceGatewayClaim[];
}

export function createGatewayRequest(
  workspaceId: string,
  question: string,
  evidence: WorkspaceEvidence[],
  externalProcessingConsent: boolean,
): IntelligenceGatewayRequest {
  if (!externalProcessingConsent) {
    throw new Error(
      'Consentimento explícito é obrigatório para processamento externo.',
    );
  }

  return {
    version: '1',
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
    consent: { externalProcessing: true },
  };
}

export function validateGroundedGatewayResponse(
  value: unknown,
  allowedEvidenceIds: Iterable<string>,
): IntelligenceGatewayResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Resposta de inteligência inválida.');
  }

  const response = value as Partial<IntelligenceGatewayResponse>;
  if (response.version !== '1' || !Array.isArray(response.claims)) {
    throw new Error('Contrato de inteligência incompatível.');
  }

  const allowed = new Set(allowedEvidenceIds);
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

    const ids = [...new Set(claim.evidenceIds)];
    if (ids.some((id) => !allowed.has(id))) {
      throw new Error('A resposta citou evidência inexistente no contexto enviado.');
    }

    return {
      id: claim.id,
      text: claim.text.trim(),
      layer: claim.layer,
      evidenceIds: ids,
    };
  });

  return { version: '1', claims };
}
