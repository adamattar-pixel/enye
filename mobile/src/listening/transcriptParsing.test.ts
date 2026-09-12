import { parseJson3Captions, parseInterceptedBody, extractLangFromUrl, extractPanelTranscriptSegments } from './transcriptParsing';

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

  // Format `get_panel` confirmé réellement le 12/09/2026 par un vrai
  // payload intercepté (débogueur Chrome DevTools Protocol, 34124
  // caractères pour dQw4w9WgXcQ) — YouTube a migré le panneau de
  // transcription vers cette forme, abandonnant `get_transcript` que
  // `captionsPreload.ts` ciblait jusque-là (voir son commentaire). Ce
  // fixture reproduit la forme réelle exacte de deux lignes consécutives.
  test('routes a get_panel body to the panel-transcript parser', () => {
    const body = JSON.stringify({
      content: {
        sectionListRenderer: {
          contents: [
            {
              itemSectionRenderer: {
                contents: [
                  {
                    macroMarkersPanelItemViewModel: {
                      item: {
                        timelineItemViewModel: {
                          timestamp: '0:18',
                          contentItems: [{ transcriptSegmentViewModel: { simpleText: 'Conocemos bien el amor' } }],
                        },
                      },
                      onTap: { innertubeCommand: { watchEndpoint: { videoId: 'dQw4w9WgXcQ', startTimeSeconds: 18 } } },
                    },
                  },
                  {
                    macroMarkersPanelItemViewModel: {
                      item: {
                        timelineItemViewModel: {
                          timestamp: '0:27',
                          contentItems: [{ transcriptSegmentViewModel: { simpleText: 'Ningún otro chico te daría tanto' } }],
                        },
                      },
                      onTap: { innertubeCommand: { watchEndpoint: { videoId: 'dQw4w9WgXcQ', startTimeSeconds: 27 } } },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    expect(parseInterceptedBody(body)).toEqual([
      { startTime: 18, endTime: 27, transcript: 'Conocemos bien el amor' },
      { startTime: 27, endTime: 31, transcript: 'Ningún otro chico te daría tanto' },
    ]);
  });
});

describe('extractPanelTranscriptSegments', () => {
  test('falls back to parsing the "m:ss" timestamp string when startTimeSeconds is absent', () => {
    const json = {
      macroMarkersPanelItemViewModel: {
        item: { timelineItemViewModel: { timestamp: '1:05', contentItems: [{ transcriptSegmentViewModel: { simpleText: 'hola' } }] } },
      },
    };
    expect(extractPanelTranscriptSegments(json)).toEqual([{ startTime: 65, endTime: 69, transcript: 'hola' }]);
  });

  test('finds panel items nested arbitrarily deep, not just at a fixed path', () => {
    const json = {
      responseContext: { irrelevant: true },
      content: {
        wrapper: [
          { unrelated: 'noise' },
          {
            macroMarkersPanelItemViewModel: {
              item: { timelineItemViewModel: { timestamp: '0:05', contentItems: [{ transcriptSegmentViewModel: { simpleText: 'segmento' } }] } },
              onTap: { innertubeCommand: { watchEndpoint: { startTimeSeconds: 5 } } },
            },
          },
        ],
      },
    };
    expect(extractPanelTranscriptSegments(json)).toEqual([{ startTime: 5, endTime: 9, transcript: 'segmento' }]);
  });

  test('returns [] when no macroMarkersPanelItemViewModel is present anywhere', () => {
    expect(extractPanelTranscriptSegments({ content: { sectionListRenderer: { contents: [] } } })).toEqual([]);
    expect(extractPanelTranscriptSegments(null)).toEqual([]);
  });

  test('skips items with no usable text', () => {
    const json = { macroMarkersPanelItemViewModel: { item: { timelineItemViewModel: { timestamp: '0:05', contentItems: [] } } } };
    expect(extractPanelTranscriptSegments(json)).toEqual([]);
  });
});

// Bug réel trouvé le 21/08/2026 : "Nuevayol" importée avec des paroles en
// anglais alors que la chanson est en espagnol — `language` était étiqueté
// 'es' en dur sans jamais vérifier ce qui avait réellement été capturé.
describe('extractLangFromUrl', () => {
  test('extracts the lang query param from a real timedtext URL', () => {
    const url =
      'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&ei=abc&caps=asr&opi=1&lang=es&fmt=json3&potc=1';
    expect(extractLangFromUrl(url)).toBe('es');
  });

  test('extracts an English lang value just as readily (the actual bug: capturing this unnoticed)', () => {
    const url = 'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=json3';
    expect(extractLangFromUrl(url)).toBe('en');
  });

  test('decodes a URL-encoded lang value (e.g. es-419 or es%2D419)', () => {
    const url = 'https://www.youtube.com/api/timedtext?v=abc&lang=es-419&fmt=json3';
    expect(extractLangFromUrl(url)).toBe('es-419');
  });

  test('falls back to "es" when no lang param is present', () => {
    const url = 'https://www.youtube.com/api/timedtext?v=abc&fmt=json3';
    expect(extractLangFromUrl(url)).toBe('es');
  });
});
