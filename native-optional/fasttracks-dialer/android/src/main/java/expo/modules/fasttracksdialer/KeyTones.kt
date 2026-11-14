package expo.modules.fasttracksdialer

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.provider.Settings

/**
 * The sound of a dial pad key: the same DTMF tones the phone's own dialer plays, with no audio files in the app. It follows the phone's own "dial pad tones"
 * setting, so a phone set to silent keys stays silent. One ToneGenerator is kept for the life of the module, so a key press never waits to create one.
 */
object KeyTones {
  private const val VOLUME = 80 // percent of the DTMF stream
  private const val DURATION_MS = 90
  private var generator: ToneGenerator? = null

  private fun toneFor(key: String): Int? = when (key) {
    "0" -> ToneGenerator.TONE_DTMF_0
    "1" -> ToneGenerator.TONE_DTMF_1
    "2" -> ToneGenerator.TONE_DTMF_2
    "3" -> ToneGenerator.TONE_DTMF_3
    "4" -> ToneGenerator.TONE_DTMF_4
    "5" -> ToneGenerator.TONE_DTMF_5
    "6" -> ToneGenerator.TONE_DTMF_6
    "7" -> ToneGenerator.TONE_DTMF_7
    "8" -> ToneGenerator.TONE_DTMF_8
    "9" -> ToneGenerator.TONE_DTMF_9
    "*" -> ToneGenerator.TONE_DTMF_S
    "#" -> ToneGenerator.TONE_DTMF_P
    else -> null
  }

  private fun enabled(context: Context): Boolean =
    try { Settings.System.getInt(context.contentResolver, Settings.System.DTMF_TONE_WHEN_DIALING, 1) == 1 } catch (_: Exception) { true }

  @Synchronized
  fun play(context: Context, key: String) {
    val tone = toneFor(key) ?: return
    if (!enabled(context)) return
    var g = generator
    if (g == null) {
      g = try { ToneGenerator(AudioManager.STREAM_DTMF, VOLUME) } catch (_: RuntimeException) { null }
      generator = g
    }
    g?.startTone(tone, DURATION_MS)
  }

  @Synchronized
  fun release() {
    generator?.release()
    generator = null
  }
}
