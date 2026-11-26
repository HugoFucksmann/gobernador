import { SubsystemRngState } from '../types/game';

export type SubsystemName = keyof SubsystemRngState;

export function normalizeSeed(seed?: number): number {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) return 1;
  const normalized = Math.floor(Math.abs(seed)) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

export function initSubsystemRng(seed: number): SubsystemRngState {
  const s = normalizeSeed(seed);
  return {
    clima: normalizeSeed((s ^ 0x9e3779b9) >>> 0),
    caos: normalizeSeed((s ^ 0x85ebca6b) >>> 0),
    vida: normalizeSeed((s ^ 0xc2b2ae35) >>> 0),
    mercado: normalizeSeed((s ^ 0x27d4eb2f) >>> 0),
    prensa: normalizeSeed((s ^ 0x165667b1) >>> 0),
  };
}

function mulberry32Step(seedState: number): { value: number; nextState: number } {
  const nextState = (seedState + 0x6d2b79f5) >>> 0;
  let t = Math.imul(nextState ^ (nextState >>> 15), 1 | nextState);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
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

export function nextSubRand(
  state: { rng: SubsystemRngState; rngState: number },
  sub: SubsystemName
): number {
  const cur = typeof state.rng?.[sub] === 'number' ? state.rng[sub] : state.rngState;
  const step = mulberry32Step(cur);
  if (state.rng) {
    state.rng[sub] = step.nextState;
  } else {
    state.rngState = step.nextState;
  }
  return step.value;
}

export function subRandRange(
  state: { rng: SubsystemRngState; rngState: number },
  sub: SubsystemName,
  min: number,
  max: number
): number {
  return min + nextSubRand(state, sub) * (max - min);
}

export function subRandInt(
  state: { rng: SubsystemRngState; rngState: number },
  sub: SubsystemName,
  min: number,
  max: number
): number {
  return Math.floor(subRandRange(state, sub, min, max + 1));
}

export function nextSeqId(state: { idSeq: number }, prefix: string): string {
  state.idSeq = (state.idSeq || 0) + 1;
  return `${prefix}_${state.idSeq}`;
}
