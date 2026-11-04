package expo.modules.exotelvoice

import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * The only class that will talk to Exotel's SDK. EMPTY ON PURPOSE until Exotel confirms the flow and ships the AAR: every method is a documented TODO, and
 * the module cannot reach this class while ExotelVoiceModule.SDK_ENABLED is false.
 *
 * From Exotel's Android SDK Integration Guide: the app answers with call.answer() itself after onIncomingCall(call) (there is no auto-answer setting), and
 *  the app must be in the FOREGROUND, with the foreground service upgraded to include the microphone type, BEFORE answer() (fine right after a tap on Call;
 *  not possible silently from the background). Incoming legs arrive as FCM push data that our backend forwards, then relaySessionData(payload, payloadVersion).
 *
 * To fill in (names are from Exotel's public Voice SDK page and must be checked against the AAR Exotel provides):
 *  - initialize: ExotelVoiceClientFactory / client.initialize(context, hostname, subscriberName, displayName, accountSid, subscriberToken), then register the
 *    call listener. onAuthenticationError -> emit("failed", "auth").
 *  - armIncoming(callRef): remember callRef; when the SDK reports an incoming call whose custom field (or, if the SDK does not expose it, the single agent leg
 *    that arrives while armed) matches -> call answer() IMMEDIATELY, with NO ringtone, NO full-screen intent and NO incoming-call notification, then
 *    emit("agent_leg"). When not armed or the callRef does not match: reject the call.
 *  - customer progress: map the SDK's media/call-state callbacks (or the backend call status) to emit("ringing") and emit("established"). Unknown: whether the
 *    SDK exposes "customer answered"; if not, the JS side will poll the backend call status instead.
 *  - hangup / mute / speaker: the SDK's CallController equivalents; emit("ended", reason) on termination, emit("failed", reason) on network loss.
 *  - the audio session must run inside [ExotelCallService] (foreground service, phoneCall|microphone) so it survives the app going to the background.
 */
class ExotelBridge(private val context: Context, private val emit: (type: String, reason: String?) -> Unit) {
  private var armedFor: String? = null

  fun initialize(hostname: String, accountSid: String, subscriberName: String, displayName: String, subscriberToken: String) {
    // TODO(after Exotel confirms): initialise the SDK. Never log subscriberToken.
  }

  fun armIncoming(callRef: String) {
    armedFor = callRef
    val svc = Intent(context, ExotelCallService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(svc) else context.startService(svc)
  }

  fun disarmIncoming() {
    armedFor = null
  }

  fun hangup() {
    armedFor = null
    context.stopService(Intent(context, ExotelCallService::class.java))
    // TODO(after Exotel confirms): end the SDK call, then emit("ended", "hung up")
  }

  fun mute(on: Boolean) { /* TODO(after Exotel confirms) */ }
  fun speaker(on: Boolean) { /* TODO(after Exotel confirms) */ }
  fun release() { hangup() }
}
