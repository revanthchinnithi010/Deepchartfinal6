/**
 * alertSound — shared alert audio utility.
 *
 * All calls are delegated to notificationManager so every alert sound
 * (including repeat reminders) plays the ringtone the user selected in
 * Settings → Notifications → Alert Sounds.
 *
 * The `type` parameter is kept for backward compatibility with existing callers
 * but is intentionally ignored — the user-selected ringtone is always used.
 */

import { playNotificationSound } from "@/lib/notificationManager";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function playAlertSound(_type: "up" | "down" | "neutral" = "neutral"): void {
  playNotificationSound();
}
