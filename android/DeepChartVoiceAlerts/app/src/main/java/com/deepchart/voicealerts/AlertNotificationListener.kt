package com.deepchart.voicealerts

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.Locale

class AlertNotificationListener : NotificationListenerService() {
    private var lastSpokenKey = ""
    private var lastSpokenAt = 0L

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val packageName = sbn.packageName
        if (packageName != TELEGRAM && packageName != TELEGRAM_X) return

        val extras = sbn.notification.extras
        val title = extras.getString(Notification.EXTRA_TITLE).orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
            ?.joinToString(" ") { it.toString() }
            .orEmpty()

        val allText = listOf(title, text, bigText, lines).joinToString(" ")
        val match = ALERT_PATTERN.find(allText) ?: return

        val id = match.groupValues[1].uppercase(Locale.US)
        val event = match.groupValues[2].lowercase(Locale.US)
        val spokenEvent = when (event) {
            "touched", "touch" -> "Touched"
            "broken", "break", "breakout" -> "Broken"
            "retested", "retest" -> "Retested"
            else -> return
        }

        val key = "$id|$spokenEvent"
        val now = System.currentTimeMillis()
        if (key == lastSpokenKey && now - lastSpokenAt < DUPLICATE_WINDOW_MS) return

        lastSpokenKey = key
        lastSpokenAt = now
        VoiceSpeaker.speak(applicationContext, "Hello, $id $spokenEvent")
    }

    override fun onDestroy() {
        VoiceSpeaker.shutdown()
        super.onDestroy()
    }

    companion object {
        private const val TELEGRAM = "org.telegram.messenger"
        private const val TELEGRAM_X = "org.thunderdog.challegram"
        private const val DUPLICATE_WINDOW_MS = 5000L
        private val ALERT_PATTERN = Regex(
            "\\b(TL-[A-Za-z0-9_-]+)\\s+(Touched|Touch|Broken|Break|Breakout|Retested|Retest)\\b",
            RegexOption.IGNORE_CASE
        )
    }
}
