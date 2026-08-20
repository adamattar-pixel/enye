import { extractVideoId } from './youtubeUrl';

const ID = 'dQw4w9WgXcQ';

describe('extractVideoId', () => {
  test('watch?v= URL', () => {
    expect(extractVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  test('watch?v= without www', () => {
    expect(extractVideoId(`https://youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  test('watch?v= without scheme', () => {
    expect(extractVideoId(`www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  test('watch?v= with a trailing timestamp param', () => {
    expect(extractVideoId(`https://www.youtube.com/watch?v=${ID}&t=42s`)).toBe(ID);
  });

  test('watch?v= with a leading param before v=', () => {
    expect(extractVideoId(`https://www.youtube.com/watch?si=abc123&v=${ID}`)).toBe(ID);
  });

  test('youtu.be short link', () => {
    expect(extractVideoId(`https://youtu.be/${ID}`)).toBe(ID);
  });

  test('youtu.be short link with a query param', () => {
    expect(extractVideoId(`https://youtu.be/${ID}?t=10`)).toBe(ID);
  });

  test('embed URL', () => {
    expect(extractVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
  });

  test('shorts URL', () => {
    expect(extractVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
  });

  test('mobile (m.youtube.com) URL', () => {
    expect(extractVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  test('trims surrounding whitespace', () => {
    expect(extractVideoId(`  https://youtu.be/${ID}  `)).toBe(ID);
  });

  test('rejects an unrelated URL', () => {
    expect(extractVideoId('https://example.com/watch?v=abc')).toBeNull();
  });

  test('rejects a YouTube URL with no recognizable video id', () => {
    expect(extractVideoId('https://www.youtube.com/results?search_query=hola')).toBeNull();
  });

  test('rejects garbage input', () => {
    expect(extractVideoId('not a url at all')).toBeNull();
  });

  test('rejects an id of the wrong length', () => {
    expect(extractVideoId('https://youtu.be/short')).toBeNull();
  });
});
