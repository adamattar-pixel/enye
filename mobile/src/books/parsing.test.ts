import {
  stripHtmlTags,
  extractTitleFromHtml,
  splitByLength,
  splitTxtIntoChapters,
  splitHtmlIntoChapters,
  splitIntoSentences,
  findOpfPath,
  parseOpfManifestAndSpine,
  extractTitleAndAuthorFromOpf,
  resolveOpfRelativePath,
} from './parsing';

describe('stripHtmlTags', () => {
  test('removes tags, decodes entities, collapses whitespace', () => {
    expect(stripHtmlTags('<p>Hola &amp; adi&#243;s</p>')).toBe('Hola & adiós');
  });

  test('removes script and style blocks entirely', () => {
    expect(stripHtmlTags('<style>.x{color:red}</style><p>Texto</p><script>alert(1)</script>')).toBe('Texto');
  });

  test('converts block tags to newlines', () => {
    expect(stripHtmlTags('<p>Uno</p><p>Dos</p>')).toBe('Uno\nDos');
  });
});

describe('extractTitleFromHtml', () => {
  test('prefers h1 over title', () => {
    expect(extractTitleFromHtml('<title>Fallback</title><h1>Capítulo Uno</h1>')).toBe('Capítulo Uno');
  });

  test('falls back to title tag', () => {
    expect(extractTitleFromHtml('<title>Solo título</title>')).toBe('Solo título');
  });

  test('returns null when neither is present', () => {
    expect(extractTitleFromHtml('<p>Sin título</p>')).toBeNull();
  });
});

describe('splitByLength', () => {
  test('never splits a paragraph in half and respects the chunk size roughly', () => {
    const paragraphs = ['A'.repeat(3000), 'B'.repeat(3000), 'C'.repeat(3000)];
    const chunks = splitByLength(paragraphs.join('\n\n'), 7000);
    expect(chunks.length).toBe(2);
    expect(chunks[0].content).toBe(paragraphs.slice(0, 2).join('\n\n'));
    expect(chunks[1].content).toBe(paragraphs[2]);
  });

  test('returns a single part for short text', () => {
    const chunks = splitByLength('Texto corto.');
    expect(chunks).toEqual([{ title: 'Partie 1', content: 'Texto corto.' }]);
  });
});

describe('splitTxtIntoChapters', () => {
  test('splits on chapter markers when at least two are found', () => {
    const text = 'Chapter 1\nHola.\nMundo.\nChapter 2\nAdiós.';
    const chapters = splitTxtIntoChapters(text);
    expect(chapters).toEqual([
      { title: 'Chapter 1', content: 'Hola.\nMundo.' },
      { title: 'Chapter 2', content: 'Adiós.' },
    ]);
  });

  test('recognizes Spanish and French markers too', () => {
    const text = 'Capítulo I\nUno.\nChapitre 2\nDos.';
    const chapters = splitTxtIntoChapters(text);
    expect(chapters.map((c) => c.title)).toEqual(['Capítulo I', 'Chapitre 2']);
  });

  test('falls back to length-based split with fewer than 2 markers', () => {
    const chapters = splitTxtIntoChapters('Solo un párrafo sin marcadores de capítulo.');
    expect(chapters).toEqual([{ title: 'Partie 1', content: 'Solo un párrafo sin marcadores de capítulo.' }]);
  });
});

describe('splitHtmlIntoChapters', () => {
  test('splits on h1/h2 boundaries, keeping the heading as the title', () => {
    const html = '<h1>Uno</h1><p>Primero.</p><h1>Dos</h1><p>Segundo.</p>';
    const chapters = splitHtmlIntoChapters(html);
    expect(chapters).toEqual([
      { title: 'Uno', content: 'Primero.' },
      { title: 'Dos', content: 'Segundo.' },
    ]);
  });

  test('falls back to length split with fewer than 2 headings', () => {
    const chapters = splitHtmlIntoChapters('<p>Sin encabezados.</p>');
    expect(chapters).toEqual([{ title: 'Partie 1', content: 'Sin encabezados.' }]);
  });
});

describe('splitIntoSentences', () => {
  test('splits on sentence-ending punctuation followed by whitespace', () => {
    expect(splitIntoSentences('Hola. ¿Qué tal? Muy bien!')).toEqual(['Hola.', '¿Qué tal?', 'Muy bien!']);
  });

  test('returns the whole paragraph as one sentence when there is no terminal punctuation', () => {
    expect(splitIntoSentences('Sin puntuación final')).toEqual(['Sin puntuación final']);
  });
});

describe('findOpfPath', () => {
  test('extracts the full-path attribute from container.xml', () => {
    const xml = '<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
    expect(findOpfPath(xml)).toBe('OEBPS/content.opf');
  });

  test('returns null when not found', () => {
    expect(findOpfPath('<container></container>')).toBeNull();
  });
});

describe('parseOpfManifestAndSpine', () => {
  test('parses manifest items and spine order regardless of attribute order', () => {
    const opf = `
      <package>
        <manifest>
          <item id="ch1" href="chap1.xhtml" media-type="application/xhtml+xml"/>
          <item href="chap2.xhtml" id="ch2" media-type="application/xhtml+xml"/>
        </manifest>
        <spine>
          <itemref idref="ch2"/>
          <itemref idref="ch1"/>
        </spine>
      </package>
    `;
    const { manifest, spineIds } = parseOpfManifestAndSpine(opf);
    expect(manifest.get('ch1')).toBe('chap1.xhtml');
    expect(manifest.get('ch2')).toBe('chap2.xhtml');
    expect(spineIds).toEqual(['ch2', 'ch1']);
  });
});

describe('extractTitleAndAuthorFromOpf', () => {
  test('extracts dc:title and dc:creator', () => {
    const opf = '<metadata><dc:title>Don Quijote</dc:title><dc:creator>Cervantes</dc:creator></metadata>';
    expect(extractTitleAndAuthorFromOpf(opf)).toEqual({ title: 'Don Quijote', author: 'Cervantes' });
  });

  test('returns nulls when absent', () => {
    expect(extractTitleAndAuthorFromOpf('<metadata></metadata>')).toEqual({ title: null, author: null });
  });
});

describe('resolveOpfRelativePath', () => {
  test('resolves relative to the OPF directory', () => {
    expect(resolveOpfRelativePath('OEBPS/content.opf', 'text/chap1.xhtml')).toBe('OEBPS/text/chap1.xhtml');
  });

  test('handles an OPF at the archive root', () => {
    expect(resolveOpfRelativePath('content.opf', 'chap1.xhtml')).toBe('chap1.xhtml');
  });
});
