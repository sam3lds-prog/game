/**
 * Optional sound: short synthesized tones (no audio files). Off by default.
 * The AudioContext is created on first use, which always follows a tap.
 */
export type SoundKind = 'place' | 'mark' | 'error' | 'win' | 'hint';

export interface Sound {
  play(kind: SoundKind): void;
}

let ctx: AudioContext | null = null;

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

export const webSound: Sound = {
  play(kind) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx ??= new AC();
      if (ctx.state === 'suspended') void ctx.resume();
      if (kind === 'place') tone(660, 0, 0.08, 'sine', 0.08);
      else if (kind === 'mark') tone(420, 0, 0.05, 'sine', 0.04);
      else if (kind === 'error') tone(190, 0, 0.14, 'triangle', 0.09);
      else if (kind === 'hint') tone(540, 0, 0.1, 'sine', 0.05);
      else if (kind === 'win') [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.18, 'sine', 0.07));
    } catch {
      /* audio unavailable */
    }
  },
};

export const silentSound: Sound = { play() {} };
