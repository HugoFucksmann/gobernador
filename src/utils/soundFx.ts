// Synthesized subtle Web Audio API feedback (zero external audio files, safe in SSR/Node).

let audioCtx: AudioContext | null = null;
let muted = false;

try {
  if (typeof window !== 'undefined') {
    muted = window.localStorage?.getItem('valle_sfx_muted') === '1';
  }
} catch {
  muted = false;
}

export function isSoundMuted(): boolean {
  return muted;
}

export function setSoundMuted(next: boolean): void {
  muted = next;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem('valle_sfx_muted', next ? '1' : '0');
    }
  } catch {
    // ignore storage failures
  }
}

function getContext(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  freq: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  gainPeak = 0.045,
  delaySec = 0
): void {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const start = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  } catch {
    // ignore playback errors when audio is blocked
  }
}

export function playDecisionSfx(): void {
  playTone(523.25, 0.09, 'triangle', 0.035, 0);
  playTone(659.25, 0.11, 'triangle', 0.03, 0.055);
}

export function playDemandSfx(): void {
  playTone(440, 0.11, 'sine', 0.04, 0);
  playTone(587.33, 0.14, 'sine', 0.035, 0.08);
}

export function playAlertSfx(): void {
  playTone(311.13, 0.14, 'sawtooth', 0.025, 0);
  playTone(261.63, 0.18, 'sawtooth', 0.022, 0.11);
}

export function playInaugurationSfx(): void {
  playTone(523.25, 0.1, 'triangle', 0.04, 0);
  playTone(659.25, 0.1, 'triangle', 0.04, 0.07);
  playTone(783.99, 0.18, 'triangle', 0.045, 0.14);
}
