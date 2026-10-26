// The keyed store behind training mode's practice sessions.
//
// On the live site every signed-in judge, commentator or administrator who
// practises gets their own session, keyed by their user id; a laptop running
// with SCORING_SAMPLE_MODE=1 uses one shared key for everyone. Sessions live
// in server memory, so the store is bounded: at most `max` sessions (the one
// used least recently is dropped to make room) and a session idle for longer
// than `idleMs` is dropped the next time the store is touched. A dropped
// session simply starts again from the sample data when its owner returns —
// which is why the practice banner says it "may reset after a while".
//
// Pure and import-free so `node --test` can load it directly
// (sample-engine.test.mts).

export type TrainingStore<T> = {
  /* The session for `key`, created on first use. Marks it as just used. */
  get: (key: string) => T;
  /* Starts `key` again from scratch. Other keys are untouched. */
  reset: (key: string) => T;
  /* Keys from least to most recently used (for tests and diagnostics). */
  keys: () => string[];
  size: () => number;
};

type Entry<T> = { value: T; lastUsed: number };

export const createTrainingStore = <T>(
  create: () => T,
  { max, idleMs, now = Date.now }: { max: number; idleMs: number; now?: () => number }
): TrainingStore<T> => {
  // A Map iterates in insertion order; every use re-inserts its key, so the
  // first key is always the least recently used.
  const entries = new Map<string, Entry<T>>();

  const dropIdle = (time: number) => {
    for (const [key, entry] of entries) {
      if (time - entry.lastUsed <= idleMs) {
        break;
      }

      entries.delete(key);
    }
  };

  const touch = (key: string, value: T, time: number) => {
    entries.delete(key);

    while (entries.size >= max) {
      const oldest = entries.keys().next();

      if (oldest.done) {
        break;
      }

      entries.delete(oldest.value);
    }

    entries.set(key, { value, lastUsed: time });
    return value;
  };

  return {
    get: (key) => {
      const time = now();
      dropIdle(time);
      return touch(key, entries.get(key)?.value ?? create(), time);
    },
    reset: (key) => {
      const time = now();
      dropIdle(time);
      return touch(key, create(), time);
    },
    keys: () => [...entries.keys()],
    size: () => entries.size,
  };
};
