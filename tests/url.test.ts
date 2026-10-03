import { describe, expect, it } from 'vitest';
import { safeExternalUrl } from '../src/lib/url';

describe('safeExternalUrl', () => {
  it('aceita destinos HTTP/HTTPS absolutos', () => {
    expect(safeExternalUrl('https://doi.org/10.1000/example')).toBe(
      'https://doi.org/10.1000/example',
    );
    expect(safeExternalUrl('http://example.org/paper.pdf')).toBe(
      'http://example.org/paper.pdf',
    );
  });

  it('rejeita protocolos executáveis, URLs inválidas e credenciais embutidas', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeExternalUrl('https://user:pass@example.org/private')).toBeUndefined();
    expect(safeExternalUrl('not a url')).toBeUndefined();
    expect(safeExternalUrl(undefined)).toBeUndefined();
  });
});
