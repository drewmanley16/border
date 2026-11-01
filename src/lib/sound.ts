let context: AudioContext | null = null;

/** Must first run from a user gesture, which the settings toggle provides. */
export function unlockSound(): void {
  context ??= new AudioContext();
  void context.resume();
}

/** A soft sine chime. Larger transfers sound lower. */
export function playArrival(amountUSD: number): void {
  if (!context || context.state !== "running") return;
  const large = amountUSD >= 100_000;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = large ? 196 : 660 + Math.random() * 260;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(large ? 0.09 : 0.018, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (large ? 1.4 : 0.35));
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 1.5);
}
