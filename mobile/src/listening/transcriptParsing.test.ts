import { parseJson3Captions, parseInterceptedBody } from './transcriptParsing';

// Format `fmt=json3` confirmé réellement le 21/08/2026 par un corps
// intercepté en conditions réelles (858 225 caractères pour une vraie
// vidéo) — voir le commentaire au-dessus de `parseJson3Captions` dans
// transcriptParsing.ts. Ce fixture reproduit la forme réelle
// (`events[].tStartMs`/`dDurationMs`/`segs[].utf8`), y compris les
// événements de positionnement pur sans `segs` que YouTube envoie
// mélangés avec les événements de texte.
describe('parseJson3Captions', () => {
  test('extracts cues from events with segs, skipping position-only events', () => {
    const json = {
      wireMagic: 'pb3',
      events: [
        { tStartMs: 0, dDurationMs: 2000, id: 1, wpWinPosId: 1 },
        { tStartMs: 120, dDurationMs: 3400, segs: [{ utf8: 'Hola' }, { utf8: ' a todos' }] },
        { tStartMs: 3600, dDurationMs: 2800, segs: [{ utf8: '¿Qué tal?' }] },
      ],
    };
    const cues = parseJson3Captions(json);
    expect(cues).toEqual([
      { startTime: 0.12, endTime: 3.52, transcript: 'Hola a todos' },
      { startTime: 3.6, endTime: 6.4, transcript: '¿Qué tal?' },
    ]);
  });

  test('defaults duration to 4s when dDurationMs is missing', () => {
    const cues = parseJson3Captions({ events: [{ tStartMs: 1000, segs: [{ utf8: 'texto' }] }] });
    expect(cues).toEqual([{ startTime: 1, endTime: 5, transcript: 'texto' }]);
  });

  test('decodes HTML entities and collapses newlines in the joined text', () => {
    const cues = parseJson3Captions({
      events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'caf&#233;\ncon leche' }] }],
    });
    expect(cues[0].transcript).toBe('café con leche');
  });

  test('skips events with an empty/whitespace-only text', () => {
    const cues = parseJson3Captions({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '   ' }] }] });
    expect(cues).toEqual([]);
  });

  test('returns [] for a payload with no events array', () => {
    expect(parseJson3Captions({ wireMagic: 'pb3' })).toEqual([]);
    expect(parseJson3Captions(null)).toEqual([]);
    expect(parseJson3Captions('not an object')).toEqual([]);
  });
});

describe('parseInterceptedBody', () => {
  test('routes a json3 body to the json3 parser', () => {
    const body = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'hola' }] }] });
    expect(parseInterceptedBody(body)).toEqual([{ startTime: 0, endTime: 1, transcript: 'hola' }]);
  });

  test('routes an XML body to the timedtext XML parser', () => {
    const body = '<transcript><text start="1.5" dur="2.5">hola mundo</text></transcript>';
    expect(parseInterceptedBody(body)).toEqual([{ startTime: 1.5, endTime: 4, transcript: 'hola mundo' }]);
  });

  test('returns [] for an empty or unparseable body', () => {
    expect(parseInterceptedBody('')).toEqual([]);
    expect(parseInterceptedBody('   ')).toEqual([]);
    expect(parseInterceptedBody('{not json')).toEqual([]);
  });
});
