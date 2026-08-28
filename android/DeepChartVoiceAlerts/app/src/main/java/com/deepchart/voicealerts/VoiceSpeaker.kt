package com.deepchart.voicealerts

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

object VoiceSpeaker {
    private var tts: TextToSpeech? = null

    fun speak(context: Context, text: String) {
        val appContext = context.applicationContext
        if (tts == null) {
            tts = TextToSpeech(appContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    tts?.language = Locale.US
                    tts?.setSpeechRate(1.0f)
                    tts?.setPitch(1.0f)
                    tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId())
                }
            }
        } else {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId())
        }
    }

    fun shutdown() {
        tts?.stop()
        tts?.shutdown()
        tts = null
    }

    private fun utteranceId() = "deepchart-${System.currentTimeMillis()}"
}
