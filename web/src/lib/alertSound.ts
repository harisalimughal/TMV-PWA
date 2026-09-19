/**
 * Short synthesized alarm chirp for the congestion/tunnel zone popup (see
 * InAppNotificationListener.tsx) -- generated with the Web Audio API rather than an
 * mp3 asset, so there's nothing to preload and no risk of playing a half-decoded file.
 * Best-effort: some browsers keep a freshly-created AudioContext suspended until the
 * page has seen a user gesture, in which case this silently does nothing rather than
 * throwing -- a missed chirp is fine, the popup itself still shows and stays on screen.
 */
export function playZoneAlertSound(): void {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();

    const playTone = (freq: number, startAt: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startAt);
      osc.stop(ctx.currentTime + startAt + duration + 0.02);
    };

    // Two-tone chirp, repeated twice -- reads as an alarm, not a generic message ping.
    playTone(880, 0, 0.18);
    playTone(660, 0.22, 0.18);
    playTone(880, 0.55, 0.18);
    playTone(660, 0.77, 0.18);

    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // best-effort only
  }
}
