package expo.modules.fasttracksdialer

import android.annotation.TargetApi
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService
import android.telecom.TelecomManager
import android.telecom.VideoProfile

/**
 * Telecom binds this service when Fasttracks is the default phone app. For EVERY call it either answers it silently (only a verified Exotel click-to-call
 * call, decided by [AutoAnswerPolicy]) or shows the normal incoming / ongoing call UI. The ringtone and vibration of normal calls are played by Telecom
 * itself (this service does not declare IN_CALL_SERVICE_RINGING), so personal calls ring exactly as before. Uses the supported Call.answer(); never the
 * deprecated acceptRingingCall().
 */
@TargetApi(Build.VERSION_CODES.Q) // the phone-app role exists from Android 10; the app's minSdk is 24, where this service is never bound
class FtInCallService : InCallService() {
  companion object {
    const val CHANNEL_INCOMING = "ft_dialer_incoming"
    const val CHANNEL_ONGOING = "ft_dialer_ongoing"
    const val NOTIF_ID = 7201
    @Volatile var instance: FtInCallService? = null
  }

  private val autoAnswered = HashSet<Call>()

  private val callback = object : Call.Callback() {
    override fun onStateChanged(call: Call, state: Int) {
      val exotel = autoAnswered.contains(call)
      CallRegistry.emit(stateName(state), exotel, stateName(state))
      if (state == Call.STATE_ACTIVE && !exotel) showCallScreen() // a normal call answered from the notification: show the call screen
      refreshNotification()
      CallRegistry.onChanged?.invoke()
    }
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    createChannels()
  }

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  /** Mute or speaker changed (by the buttons, a headset or Bluetooth): the call screen redraws at once instead of waiting for its next tick. */
  @Suppress("DEPRECATION")
  override fun onCallAudioStateChanged(audioState: CallAudioState) {
    super.onCallAudioStateChanged(audioState)
    CallRegistry.onChanged?.invoke()
  }

  override fun onCallAdded(call: Call) {
    super.onCallAdded(call)
    val otherActive = CallRegistry.all().any { it !== call && CallRegistry.isLive(it) }
    CallRegistry.add(call)
    call.registerCallback(callback)
    if (CallRegistry.stateOf(call) != Call.STATE_RINGING) { // an outgoing call (this app or another placed it): show the in-call screen
      CallRegistry.emit("outgoing", false, stateName(CallRegistry.stateOf(call)))
      showCallScreen()
      refreshNotification()
      return
    }
    val number = call.details?.handle?.schemeSpecificPart
    val attempt = PendingStore.peek(this)
    val decision = AutoAnswerPolicy.decide(number, attempt, System.currentTimeMillis(), otherActive)
    if (decision == Decision.EXPIRED || decision == Decision.ANSWER) PendingStore.clear(this) // single use, and expired attempts never linger
    when (decision) {
      Decision.ANSWER -> {
        autoAnswered.add(call)
        CallRegistry.markExotel(call)
        try { getSystemService(TelecomManager::class.java).silenceRinger() } catch (_: SecurityException) { /* answering anyway */ }
        call.answer(VideoProfile.STATE_AUDIO_ONLY)
        CallRegistry.emit("auto_answered", true, "answering")
        showCallScreen() // the same call screen as any phone app: customer, timer, Mute / Speaker / Hold / End
        refreshNotification()
      }
      Decision.LEARN_ONLY -> {
        CallRegistry.emit("learn", false, "ringing", number) // report what Exotel shows; the call is NOT answered
        showIncoming(call)
      }
      else -> {
        CallRegistry.emit("incoming", false, "ringing")
        showIncoming(call)
      }
    }
  }

  override fun onCallRemoved(call: Call) {
    call.unregisterCallback(callback)
    val exotel = autoAnswered.remove(call)
    CallRegistry.remove(call)
    CallRegistry.emit("ended", exotel, "disconnected")
    refreshNotification()
  }

  // ---- UI ------------------------------------------------------------------------------------------------------------------------

  private fun showCallScreen() {
    startActivity(Intent(this, InCallActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
  }

  private fun showIncoming(call: Call) {
    val screen = PendingIntent.getActivity(this, 0, Intent(this, InCallActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags())
    val n = Notification.Builder(this, CHANNEL_INCOMING)
      .setSmallIcon(android.R.drawable.sym_action_call)
      .setContentTitle("Incoming call")
      .setContentText(call.details?.handle?.schemeSpecificPart ?: "Unknown number")
      .setCategory(Notification.CATEGORY_CALL)
      .setOngoing(true)
      .setFullScreenIntent(screen, true)
      .setContentIntent(screen)
      .addAction(Notification.Action.Builder(null, "Answer", action(CallActionReceiver.ANSWER)).build())
      .addAction(Notification.Action.Builder(null, "Reject", action(CallActionReceiver.REJECT)).build())
      .build()
    getSystemService(NotificationManager::class.java).notify(NOTIF_ID, n)
  }

  /** Ongoing-call notification (Hang up) for any live, non-ringing call; cancelled when no call is left. */
  private fun refreshNotification() {
    val live = CallRegistry.all().filter { CallRegistry.isLive(it) }
    val nm = getSystemService(NotificationManager::class.java)
    val active = live.firstOrNull { CallRegistry.stateOf(it) != Call.STATE_RINGING }
    if (active == null) {
      if (live.none { CallRegistry.stateOf(it) == Call.STATE_RINGING }) nm.cancel(NOTIF_ID)
      return
    }
    val screen = PendingIntent.getActivity(this, 0, Intent(this, InCallActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags())
    val n = Notification.Builder(this, CHANNEL_ONGOING)
      .setSmallIcon(android.R.drawable.sym_action_call)
      .setContentTitle("Call in progress")
      .setContentText(active.details?.handle?.schemeSpecificPart ?: "")
      .setCategory(Notification.CATEGORY_CALL)
      .setOngoing(true)
      .setContentIntent(screen)
      .addAction(Notification.Action.Builder(null, "Hang up", action(CallActionReceiver.HANGUP)).build())
      .build()
    nm.notify(NOTIF_ID, n)
  }

  private fun action(a: String) = PendingIntent.getBroadcast(this, a.hashCode(), Intent(this, CallActionReceiver::class.java).setAction(a), flags())
  private fun flags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java)
    // No sound on either channel: the ringtone is Telecom's, not the notification's.
    nm.createNotificationChannel(NotificationChannel(CHANNEL_INCOMING, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply { setSound(null, null); enableVibration(false) })
    nm.createNotificationChannel(NotificationChannel(CHANNEL_ONGOING, "Calls in progress", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null) })
  }

  private fun stateName(state: Int) = when (state) {
    Call.STATE_RINGING -> "ringing"
    Call.STATE_ACTIVE -> "active"
    Call.STATE_DIALING, Call.STATE_CONNECTING -> "dialing"
    Call.STATE_HOLDING -> "holding"
    Call.STATE_DISCONNECTING, Call.STATE_DISCONNECTED -> "disconnected"
    else -> "other"
  }
}
