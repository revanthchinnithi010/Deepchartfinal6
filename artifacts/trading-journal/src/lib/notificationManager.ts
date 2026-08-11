/**
 * notificationManager — single source of truth for alert notification sounds.
 *
 * ALL alert types (price, zone, trendline) and their repeat reminders must
 * call playNotificationSound() from this module. No other module should
 * synthesise audio for alerts.
 *
 * Design principles:
 *  • Reads the user-selected ringtone from localStorage on EVERY call so a
 *    setting change in Settings → Notifications → Alert Sounds takes effect
 *    for the very next alert — no restart required.
 *  • Honours soundEnabled: false → silent.
 *  • Duplicate-play guard: if a sound is already in progress, the new call is
 *    dropped (prevents stacking simultaneous sounds for the same event).
 *  • Built-in sounds use Web Audio synthesis (no external files, no system sounds).
 *  • Custom sound: user-uploaded MP3 stored as a base64 data URL in localStorage.
 *    Falls back to Default if no file has been uploaded yet.
 */

const LS_KEY         = "tj_notification_prefs";
const LS_CUSTOM_KEY  = "tj_custom_ringtone_v1";   // stores base64 data URL
const LS_CUSTOM_NAME = "tj_custom_ringtone_name";  // stores original filename

type SoundOption = "Default" | "Chime" | "Ping" | "Bell" | "Ding" | "Custom";

interface NotifPrefs {
  soundEnabled: boolean;
  sound: SoundOption;
}

function readPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<NotifPrefs>;
      return {
        soundEnabled: p.soundEnabled !== false,
        sound: (p.sound as SoundOption) ?? "Default",
      };
    }
  } catch { /* ignore */ }
  return { soundEnabled: true, sound: "Default" };
}

// ── Custom ringtone storage helpers (exported for settings page) ──────────────

/** Save a base64 data URL from an uploaded MP3 file. */
export function saveCustomRingtone(dataUrl: string, filename: string): void {
  try {
    localStorage.setItem(LS_CUSTOM_KEY, dataUrl);
    localStorage.setItem(LS_CUSTOM_NAME, filename);
  } catch { /* ignore — quota exceeded silently */ }
}

/** Remove the stored custom ringtone. */
export function clearCustomRingtone(): void {
  try {
    localStorage.removeItem(LS_CUSTOM_KEY);
    localStorage.removeItem(LS_CUSTOM_NAME);
  } catch { /* ignore */ }
}

/** Returns the stored filename, or null if no custom ringtone is saved. */
export function getCustomRingtoneName(): string | null {
  try { return localStorage.getItem(LS_CUSTOM_NAME); } catch { return null; }
}

/** Returns true if a custom ringtone data URL is stored. */
export function hasCustomRingtone(): boolean {
  try { return !!localStorage.getItem(LS_CUSTOM_KEY); } catch { return false; }
}

// ── AudioContext factory ──────────────────────────────────────────────────────

function makeCtx(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    return new AudioCtx();
  } catch {
    return null;
  }
}

// ── Built-in ringtone synthesisers ────────────────────────────────────────────
// Each returns the total duration in seconds.

function synthDefault(ctx: AudioContext): number {
  const freqs = [523.25, 659.25, 783.99];
  let t = ctx.currentTime;
  for (const freq of freqs) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.start(t); osc.stop(t + 0.24);
    t += 0.14;
  }
  return t - ctx.currentTime + 0.25;
}

function synthChime(ctx: AudioContext): number {
  const partials: [freq: number, vol: number, dur: number][] = [
    [523.25, 0.15, 1.0],
    [1046.5, 0.08, 0.75],
    [1568.0, 0.04, 0.55],
  ];
  const t = ctx.currentTime;
  for (const [freq, vol, dur] of partials) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  return 1.1;
}

function synthPing(ctx: AudioContext): number {
  const t = ctx.currentTime;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(1320, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.20, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
  osc.start(t); osc.stop(t + 0.32);
  return 0.4;
}

function synthBell(ctx: AudioContext): number {
  const partials: [freq: number, vol: number, dur: number][] = [
    [440,  0.18, 1.3],
    [880,  0.09, 1.0],
    [1320, 0.05, 0.75],
  ];
  const t = ctx.currentTime;
  for (const [freq, vol, dur] of partials) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  return 1.45;
}

function synthDing(ctx: AudioContext): number {
  const freqs = [880, 698.46];
  let t = ctx.currentTime;
  for (const freq of freqs) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.17, t + 0.007);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.start(t); osc.stop(t + 0.30);
    t += 0.18;
  }
  return t - ctx.currentTime + 0.32;
}

// ── Duplicate-play guard ──────────────────────────────────────────────────────

let guardUntilMs = 0;

// ── Custom MP3 async playback ─────────────────────────────────────────────────

async function playCustomAsync(): Promise<void> {
  // Pre-empt the guard with a generous window while we decode
  guardUntilMs = Date.now() + 60_000;

  const dataUrl = (() => {
    try { return localStorage.getItem(LS_CUSTOM_KEY); } catch { return null; }
  })();

  if (!dataUrl) {
    // No file uploaded yet — fall back to Default synthesised sound
    guardUntilMs = 0;
    const ctx = makeCtx();
    if (!ctx) return;
    const dur = synthDefault(ctx);
    guardUntilMs = Date.now() + dur * 1000;
    setTimeout(() => ctx.close(), (dur + 0.3) * 1000);
    return;
  }

  const ctx = makeCtx();
  if (!ctx) { guardUntilMs = 0; return; }

  try {
    // data URL → ArrayBuffer
    const comma = dataUrl.indexOf(",");
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const binary = atob(base64);
    const bytes   = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(0);

    guardUntilMs = Date.now() + audioBuffer.duration * 1000;
    setTimeout(() => ctx.close(), (audioBuffer.duration + 0.5) * 1000);
  } catch {
    // Corrupted or unsupported file — release guard, fall silent
    guardUntilMs = 0;
    try { ctx.close(); } catch { /* ignore */ }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Play the user-selected notification sound once.
 *
 * This is the ONLY function that should be called to produce alert audio.
 * Shared by: price alerts, zone alerts, trendline alerts, and all repeat-
 * reminder notifications.
 */
export function playNotificationSound(): void {
  const prefs = readPrefs();
  if (!prefs.soundEnabled) return;

  const now = Date.now();
  if (now < guardUntilMs) return; // already playing — drop duplicate

  if (prefs.sound === "Custom") {
    // Fire-and-forget async path for user-uploaded MP3
    void playCustomAsync();
    return;
  }

  const ctx = makeCtx();
  if (!ctx) return;

  let durationSec: number;
  switch (prefs.sound) {
    case "Chime": durationSec = synthChime(ctx);   break;
    case "Ping":  durationSec = synthPing(ctx);    break;
    case "Bell":  durationSec = synthBell(ctx);    break;
    case "Ding":  durationSec = synthDing(ctx);    break;
    default:      durationSec = synthDefault(ctx); break;
  }

  guardUntilMs = now + durationSec * 1000;
  setTimeout(() => ctx.close(), (durationSec + 0.3) * 1000);
}
