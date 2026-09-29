/**
 * Short synthesized alarm chirp for the congestion/tunnel zone popup (see
 * InAppNotificationListener.tsx) -- generated with the Web Audio API rather than an
 * mp3 asset, so there's nothing to preload and no risk of playing a half-decoded file.
 * Best-effort: some browsers keep a freshly-created AudioContext suspended until the
 * page has seen a user gesture, in which case this silently does nothing rather than
 * throwing -- a missed chirp is fine, the popup itself still shows and stays on screen.
 */
function createAudioContext(): AudioContext | null {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
}

let persistentCtx: AudioContext | null = null;

function getPersistentAudioContext(): AudioContext | null {
  if (persistentCtx && persistentCtx.state !== "closed") return persistentCtx;
  persistentCtx = createAudioContext();
  return persistentCtx;
}

/**
 * Mobile browsers, especially iOS installed PWAs, often require Web Audio to be
 * started inside a user gesture before later programmatic alert sounds can play.
 * This primes a shared context with a near-silent blip on the driver's first tap/key.
 */
export function primePersistentAlertSound(): void {
  try {
    const ctx = getPersistentAudioContext();
    if (!ctx) return;
    void ctx.resume?.();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.03);
  } catch {
    // best-effort only
  }
}

export function playZoneAlertSound(): void {
  try {
    const ctx = createAudioContext();
    if (!ctx) return;

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

/**
 * Louder, longer ring for persistent driver popups (admin broadcast, congestion and
 * tunnel alerts). Browsers still cap output volume and may block autoplay before a
 * user gesture; this keeps the app side as attention-grabbing as the platform allows.
 */
export function playPersistentAlertSound(): void {
  try {
    const ctx = getPersistentAudioContext() ?? createAudioContext();
    if (!ctx) return;
    void ctx.resume?.();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 0.04);
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.4);
    master.connect(ctx.destination);

    const playRing = (startAt: number) => {
      for (const freq of [988, 1245]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt);
        gain.gain.exponentialRampToValueAtTime(0.38, ctx.currentTime + startAt + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + 0.48);
        osc.connect(gain);
        gain.connect(master);
        osc.start(ctx.currentTime + startAt);
        osc.stop(ctx.currentTime + startAt + 0.52);
      }
    };

    // Five urgent rings, spaced like a phone/alarm cadence rather than a subtle ping.
    [0, 0.62, 1.24, 1.86, 2.48].forEach(playRing);

    if (ctx !== persistentCtx) {
      setTimeout(() => ctx.close().catch(() => {}), 3800);
    }
  } catch {
    // best-effort only
  }
}
