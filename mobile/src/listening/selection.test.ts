import { selectEligibleVideoIds, pickRandomVideo, pickRandomSegment, VIDEO_COOLDOWN } from './selection';

describe('selectEligibleVideoIds', () => {
  test('excludes videos used in the last VIDEO_COOLDOWN exercises', () => {
    const due = ['A', 'B', 'C', 'D'];
    const recent = ['A', 'C', 'B']; // 3 derniers exercices, plus récent d'abord
    const eligible = selectEligibleVideoIds(due, recent, 3);
    expect(eligible.sort()).toEqual(['D']);
  });

  test('a video outside the cooldown window is eligible again', () => {
    const due = ['A', 'B', 'C', 'D'];
    const recent = ['A', 'C', 'B', 'D']; // seuls les 3 premiers comptent avec cooldown=3
    const eligible = selectEligibleVideoIds(due, recent, 3);
    expect(eligible.sort()).toEqual(['D']);
  });

  test('empty recent history makes every due video eligible', () => {
    const due = ['A', 'B', 'C'];
    expect(selectEligibleVideoIds(due, [], 3).sort()).toEqual(['A', 'B', 'C']);
  });

  describe('cas limite : trop peu de vidéos pour respecter le cooldown', () => {
    test('1 video available: always eligible (nothing else to choose)', () => {
      const due = ['A'];
      const recent = ['A', 'A', 'A'];
      expect(selectEligibleVideoIds(due, recent, 3)).toEqual(['A']);
    });

    test('2 videos available with cooldown=3: relaxes until one becomes eligible', () => {
      const due = ['A', 'B'];
      const recent = ['A', 'B', 'A']; // A utilisée 2x, B 1x dans les 3 derniers
      const eligible = selectEligibleVideoIds(due, recent, 3);
      // Relâchement : windowSize=3 exclut A et B (vide) -> windowSize=2
      // exclut A et B (toujours vide, recent[0..1]=[A,B]) -> windowSize=1
      // exclut seulement A (le tout dernier) -> B devient éligible.
      expect(eligible).toEqual(['B']);
    });

    test('3 videos available with cooldown=3: relaxes to free up the least-recently-used one first', () => {
      const due = ['A', 'B', 'C'];
      const recent = ['A', 'B', 'C']; // A = le plus récent, C = le moins récent des 3
      // windowSize=3 exclut A,B,C (vide) -> windowSize=2 exclut les 2
      // PLUS récents (A, B) -> C (le moins récent des 3) devient
      // éligible en premier, cohérent avec l'esprit du cooldown.
      const eligible = selectEligibleVideoIds(due, recent, 3);
      expect(eligible).toEqual(['C']);
    });

    test('4 videos available with cooldown=3: strict cooldown respected without relaxation', () => {
      const due = ['A', 'B', 'C', 'D'];
      const recent = ['A', 'B', 'C'];
      expect(selectEligibleVideoIds(due, recent, 3)).toEqual(['D']);
    });
  });

  test('VIDEO_COOLDOWN constant is 3, as specified', () => {
    expect(VIDEO_COOLDOWN).toBe(3);
  });
});

describe('pickRandomVideo — no bias by segment count', () => {
  test('each eligible video has (approximately) the same probability regardless of how it got there', () => {
    // Simule une vidéo "A" avec 100 segments dus et une vidéo "B" avec
    // 2 — mais selectEligibleVideoIds ne voit que des video_id
    // DISTINCTS (comme le fait la vraie requête SQL, voir
    // database.ts/getDueListeningCardsSplit), donc A et B apparaissent
    // chacune une seule fois dans dueVideoIds quel que soit leur nombre
    // de segments.
    const dueVideoIds = ['A', 'B']; // distinct, peu importe 100 vs 2 segments
    const counts: Record<string, number> = { A: 0, B: 0 };
    const trials = 2000;

    for (let i = 0; i < trials; i++) {
      const chosen = pickRandomVideo(selectEligibleVideoIds(dueVideoIds, []));
      if (chosen) counts[chosen]++;
    }

    const ratio = counts.A / trials;
    // Attendu ~50%, tolérance large pour un test statistique non-flaky.
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  test('returns null when no video is eligible', () => {
    expect(pickRandomVideo([])).toBeNull();
  });
});

describe('pickRandomSegment', () => {
  test('returns null for an empty list', () => {
    expect(pickRandomSegment([])).toBeNull();
  });

  test('returns one of the given segments', () => {
    const segments = ['s1', 's2', 's3'];
    const picked = pickRandomSegment(segments);
    expect(segments).toContain(picked);
  });
});
