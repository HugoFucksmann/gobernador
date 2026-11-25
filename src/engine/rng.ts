export function normalizeSeed(seed?: number): number {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) return 1;
  const normalized = Math.floor(Math.abs(seed)) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

export function mulberry32Step(seedState: number): { value: number; nextState: number } {
  const nextState = (seedState + 0x6d2b79f5) >>> 0;
  let t = Math.imul(nextState ^ (nextState >>> 15), 1 | nextState);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}

export function createSeededRng(seed: number): () => number {
  let s = normalizeSeed(seed);
  return () => {
    const step = mulberry32Step(s);
    s = step.nextState;
    return step.value;
  };
}

export function nextRand(state: { rngState: number }): number {
  const step = mulberry32Step(state.rngState);
  state.rngState = step.nextState;
  return step.value;
}

export function randRange(state: { rngState: number }, min: number, max: number): number {
  return min + nextRand(state) * (max - min);
}

export function randInt(state: { rngState: number }, min: number, max: number): number {
  return Math.floor(randRange(state, min, max + 1));
}

export function nextSeqId(state: { idSeq: number }, prefix: string): string {
  state.idSeq = (state.idSeq || 0) + 1;
  return `${prefix}_${state.idSeq}`;
}
