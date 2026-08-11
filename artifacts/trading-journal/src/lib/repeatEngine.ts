/**
 * repeatEngine — shared alert repeat scheduler.
 *
 * Three repeat modes for all alert types:
 *   • three_reminders        — t=0 (existing system), +5 min, +10 min → auto-delete
 *   • repeat_until_dismissed — t=0 (existing system), then every 10 min indefinitely
 *   • triple_ring            — t=0 one notification + sound plays 3× with 1 s pauses
 *
 * Persistence: pending schedules are stored in localStorage so they survive
 * page reloads. Timer handles live only in the module-level Map; on reload
 * resumeSchedules() recreates them from the persisted data.
 *
 * Duplicate-guard: scheduleRepeat() always calls cancelRepeat() first, so
 * calling it twice for the same alertId is safe.
 */

import { playAlertSound } from "@/lib/alertSound";
import type { NotifType, NotifSeverity } from "@/contexts/NotificationsContext";

export type RepeatMode =
  | "three_reminders"
  | "repeat_until_dismissed"
  | "triple_ring";

// Mirrors Omit<AppNotification, "id" | "timestamp" | "read"> from NotificationsContext
interface NotifPayload {
  type: NotifType;
  title: string;
  description: string;
  severity: NotifSeverity;
}

type AddNotificationFn = (n: NotifPayload) => void;
type DeleteAlertFn    = (id: string) => void;

// ── localStorage schema ───────────────────────────────────────────────────────
const LS_KEY = "tj_repeat_schedules_v1";

interface PersistedSchedule {
  alertId:       string;
  mode:          RepeatMode;
  /** How many engine-issued follow-up reminders have already fired. */
  remindersSent: number;
  /** Unix-ms timestamp for the next fire. */
  nextFireAt:    number;
  symbol:        string;
  alertType:     "price" | "zone" | "trendline";
  description:   string;
}

function loadSchedules(): PersistedSchedule[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PersistedSchedule[]) : [];
  } catch {
    return [];
  }
}

function saveSchedules(schedules: PersistedSchedule[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(schedules)); } catch { /* ignore */ }
}

function upsertSchedule(s: PersistedSchedule) {
  const rest = loadSchedules().filter(x => x.alertId !== s.alertId);
  saveSchedules([...rest, s]);
}

function removeSchedule(alertId: string) {
  saveSchedules(loadSchedules().filter(x => x.alertId !== alertId));
}

// ── Module-level timer registry ───────────────────────────────────────────────
const timers = new Map<string, ReturnType<typeof setTimeout>[]>();

function clearTimers(alertId: string) {
  const handles = timers.get(alertId) ?? [];
  handles.forEach(clearTimeout);
  timers.delete(alertId);
}

function addTimer(alertId: string, handle: ReturnType<typeof setTimeout>) {
  const existing = timers.get(alertId) ?? [];
  timers.set(alertId, [...existing, handle]);
}

// Timed follow-ups are intentionally backend-owned. The browser only handles
// the optional Triple Ring sound effect.

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the repeat sequence for an alert that just triggered.
 *
 * The FIRST notification is already issued by the existing NotificationsContext.
 * This function:
 *   - Plays the alert sound for the initial trigger
 *   - For triple_ring: plays 2 additional sounds with 1 s pauses
 *   - For three_reminders / repeat_until_dismissed: persists a schedule and
 *     queues follow-up notifications + sounds
 */
export function scheduleRepeat(
  alertId: string,
  mode: RepeatMode,
  info: {
    symbol:    string;
    alertType: "price" | "zone" | "trendline";
    description: string;
  },
  addNotification: AddNotificationFn,
  deleteAlert:     DeleteAlertFn,
) {
  // The backend now owns all timed Telegram reminders. Do not create a second
  // browser-side reminder schedule, otherwise the app can show duplicate
  // notifications while the backend is also sending the real Telegram message.
  cancelRepeat(alertId);

  if (mode === "triple_ring") {
    // One notification + three sound pulses. No timed reminder messages.
    playAlertSound("neutral");
    addTimer(alertId, setTimeout(() => playAlertSound("neutral"), 2000));
    addTimer(alertId, setTimeout(() => playAlertSound("neutral"), 4000));
    return;
  }

  // three_reminders and repeat_until_dismissed are scheduled by AlertEngine on
  // the server and persisted in PostgreSQL. Browser timers are intentionally
  // not used for these modes.
  void info;
  void addNotification;
  void deleteAlert;
}

/**
 * Cancel all pending repeat timers and remove the persisted schedule.
 * Call when an alert is deleted, disabled, or edited.
 */
export function cancelRepeat(alertId: string) {
  clearTimers(alertId);
  removeSchedule(alertId);
}

/**
 * Resume any schedules persisted from a previous session.
 * Call once on app mount (via useRepeatEngine).
 *
 * @param activeAlertIds  Set of alert IDs that still exist in the store.
 *                        Schedules for missing alerts are discarded.
 */
export function resumeSchedules(
  _addNotification: AddNotificationFn,
  _deleteAlert: DeleteAlertFn,
  _activeAlertIds: Set<string>,
) {
  // v1 browser schedules belonged to the old client-side repeat engine.
  // Remove them so an upgraded client cannot send duplicate local reminders.
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }

  for (const handles of timers.values()) {
    handles.forEach(clearTimeout);
  }
  timers.clear();
}
