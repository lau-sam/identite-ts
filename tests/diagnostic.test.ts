import { describe, expect, it } from 'vitest';
import { decrireCodeBarre } from '../src/diagnostic';

describe('decrireCodeBarre', () => {
  it('décrit un QR sans en révéler le contenu', () => {
    const texte = 'CH01MUSTERMANN<ERIKA<19640812<ZH<0123456789';
    const d = decrireCodeBarre({ format: 'QRCode', texte });
    expect(d.format).toBe('QRCode');
    expect(d.longueur).toBe(texte.length);
    expect(d.prefixe).toBe('CH01');
    // Aucune donnée d'identité ne doit survivre à la description.
    const serialise = JSON.stringify(d);
    expect(serialise).not.toContain('MUSTERMANN');
    expect(serialise).not.toContain('ERIKA');
    expect(serialise).not.toContain('19640812');
  });

  it('reconnaît un contenu strictement numérique', () => {
    expect(decrireCodeBarre({ format: 'QRCode', texte: '0123456789' }).alphabet).toBe('numerique');
  });

  it('reconnaît un contenu base64url', () => {
    const d = decrireCodeBarre({ format: 'QRCode', texte: 'eyJhbGciOiJFUzI1NiJ9-_abc' });
    expect(d.alphabet).toBe('base64url');
  });

  it('signale les séparateurs de contrôle sans les recopier', () => {
    const texte = 'DC04FR0162MARTIN\u001d60MAELYS\u001fSIGNATURE';
    const d = decrireCodeBarre({ format: 'DataMatrix', texte });
    expect(d.separateurs).toEqual(['U+001D', 'U+001F']);
    expect(d.alphabet).toBe('binaire');
  });

  it('tolère un contenu vide', () => {
    const d = decrireCodeBarre({ format: 'QRCode', texte: '' });
    expect(d.longueur).toBe(0);
    expect(d.prefixe).toBe('');
    expect(d.separateurs).toEqual([]);
  });
});
