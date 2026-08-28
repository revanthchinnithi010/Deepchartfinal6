package com.deepchart.voicealerts

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val status = findViewById<TextView>(R.id.status)
        val openSettings = findViewById<Button>(R.id.open_settings)
        val testVoice = findViewById<Button>(R.id.test_voice)

        openSettings.setOnClickListener {
            startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"))
        }

        testVoice.setOnClickListener {
            VoiceSpeaker.speak(this, "Hello, TL-0103 Touched")
        }

        status.text = "Telegram voice alerts are ready.\n\n1. Allow Notification Access below.\n2. Keep Telegram notifications enabled.\n3. Test the voice."
    }
}
