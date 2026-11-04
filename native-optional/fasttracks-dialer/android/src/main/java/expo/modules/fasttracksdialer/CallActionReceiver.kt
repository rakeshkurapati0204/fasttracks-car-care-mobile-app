package expo.modules.fasttracksdialer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telecom.Call
import android.telecom.VideoProfile

/** Answer / Reject / Hang up from the notification buttons. Acts on the newest live call only. */
class CallActionReceiver : BroadcastReceiver() {
  companion object {
    const val ANSWER = "expo.modules.fasttracksdialer.ANSWER"
    const val REJECT = "expo.modules.fasttracksdialer.REJECT"
    const val HANGUP = "expo.modules.fasttracksdialer.HANGUP"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val call = CallRegistry.current() ?: return
    when (intent.action) {
      ANSWER -> if (CallRegistry.stateOf(call) == Call.STATE_RINGING) call.answer(VideoProfile.STATE_AUDIO_ONLY)
      REJECT -> if (CallRegistry.stateOf(call) == Call.STATE_RINGING) call.reject(false, null)
      HANGUP -> call.disconnect()
    }
  }
}
