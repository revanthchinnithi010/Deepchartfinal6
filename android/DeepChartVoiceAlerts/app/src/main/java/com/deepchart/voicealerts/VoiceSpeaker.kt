package com.deepchart.voicealerts

import android.content.Context
import android.media.AudioAttributes
import android.speech.tts.TextToSpeech
import android.os.Bundle
import java.util.Locale

object VoiceSpeaker {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var pendingText: String? = null

    fun speak(context: Context, text: String) {
        val appContext = context.applicationContext
        pendingText = text

        if (tts == null) {
            tts = TextToSpeech(appContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    val engine = tts ?: return@TextToSpeech
                    ready = true
                    engine.language = Locale.US
                    engine.setSpeechRate(0.82f)
                    engine.setPitch(1.0f)
                    engine.setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    pendingText?.let {
                        speakNow(engine, it)
                        pendingText = null
                    }
                }
            }
        } else if (ready) {
            tts?.let { speakNow(it, text) }
        }
    }

    private fun speakNow(engine: TextToSpeech, text: String) {
        // Spell the trendline ID slowly so Android voices do not merge the digits.
        val clearText = text
            .replace(Regex("TL-(\\d+)")) { match ->
                "T L, ${match.groupValues[1].map { digit -> digitName(digit) }.joinToString(" ")},"
            }
            .replace("Touched", "Touched.")
            .replace("Broken", "Broken.")
            .replace("Retested", "Retested.")

        val params = Bundle().apply {
            putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
        }
        engine.speak(clearText, TextToSpeech.QUEUE_FLUSH, params, utteranceId())
    }

    private fun digitName(digit: Char): String = when (digit) {
        '0' -> "zero"
        '1' -> "one"
        '2' -> "two"
        '3' -> "three"
        '4' -> "four"
        '5' -> "five"
        '6' -> "six"
        '7' -> "seven"
        '8' -> "eight"
        '9' -> "nine"
        else -> digit.toString()
    }

    fun shutdown() {
        ready = false
        pendingText = null
        tts?.stop()
        tts?.shutdown()
        tts = null
    }

    private fun utteranceId() = "deepchart-${System.currentTimeMillis()}"
}
