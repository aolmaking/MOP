import { clearDraft, emptyDraft, isWorthKeeping, loadDraft, saveDraft, type IntakeDraft } from './intake-draft';

/** A Storage that behaves, plus one that throws, since both are real. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

function hostileStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    clear: () => {
      throw new Error('nope');
    },
    getItem: () => {
      throw new Error('nope');
    },
    key: () => null,
    removeItem: () => {
      throw new Error('nope');
    },
    setItem: () => {
      throw new Error('quota');
    },
  } as unknown as Storage;
}

function withComplaint(complaint: string): IntakeDraft {
  return { ...emptyDraft(), complaint };
}

describe('intake draft', () => {
  it('round-trips a draft worth keeping', () => {
    const storage = memoryStorage();
    saveDraft(withComplaint('Brakes squealing'), storage);

    expect(loadDraft(storage)?.complaint).toBe('Brakes squealing');
  });

  it('does not persist an untouched form', () => {
    // Otherwise merely opening the page would arm a "restore?" prompt
    // the next time, which trains people to dismiss it without reading.
    const storage = memoryStorage();
    saveDraft(emptyDraft(), storage);

    expect(loadDraft(storage)).toBeNull();
  });

  it('refuses a draft older than the shift that created it', () => {
    // An advisor returning next morning is far likelier to submit
    // yesterday's half-finished intake against the wrong customer than
    // to want it back -- the car was booked in or driven away hours ago.
    const storage = memoryStorage();
    const stale = { ...withComplaint('Old'), savedAt: new Date(Date.now() - 13 * 3_600_000).toISOString() };
    storage.setItem('mop.intake.draft', JSON.stringify(stale));

    expect(loadDraft(storage)).toBeNull();
  });

  it('discards a draft written by an older version rather than guessing', () => {
    const storage = memoryStorage();
    storage.setItem('mop.intake.draft', JSON.stringify({ version: 0, savedAt: new Date().toISOString() }));

    expect(loadDraft(storage)).toBeNull();
  });

  it('survives corrupt storage instead of taking the page down', () => {
    const storage = memoryStorage();
    storage.setItem('mop.intake.draft', '{not json');

    expect(loadDraft(storage)).toBeNull();
  });

  it('survives storage that throws, in both directions', () => {
    // Private browsing throws on setItem; a full quota throws too. Losing
    // the draft is bad, crashing intake at the counter is worse.
    const storage = hostileStorage();

    expect(() => saveDraft(withComplaint('x'), storage)).not.toThrow();
    expect(loadDraft(storage)).toBeNull();
    expect(() => clearDraft(storage)).not.toThrow();
  });

  it('counts a chosen customer as worth keeping even with nothing typed', () => {
    const draft = { ...emptyDraft(), customer: { id: 'c1', fullName: 'Mona Adel', phone: '010', vehicles: [] } };

    expect(isWorthKeeping(draft)).toBe(true);
  });
});
