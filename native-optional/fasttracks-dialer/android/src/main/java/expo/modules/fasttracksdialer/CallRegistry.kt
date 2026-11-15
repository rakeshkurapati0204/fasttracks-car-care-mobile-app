package expo.modules.fasttracksdialer

import android.os.Build
import android.telecom.Call

/** The calls Telecom has handed to this app, plus the channel that tells the React Native side what happened. In-memory: Telecom re-adds live calls on restart. */
object CallRegistry {
  private val calls = LinkedHashSet<Call>()
  @Volatile var sink: ((Map<String, Any?>) -> Unit)? = null
  @Volatile var onChanged: (() -> Unit)? = null
  /** The customer the salesman dialled from the app (shown on the call screen of the click-to-call call, whose Android number is the company line). */
  @Volatile var exotelLabel: String? = null
  private val exotel = HashSet<Call>()

  /** Set when the app opens the call screen the moment Call is pressed. The screen shows "Calling..." until Exotel's call arrives, the salesman ends it, or CONNECT_WAIT_MS passes. */
  @Volatile private var connectingSinceMs: Long = 0L
  const val CONNECT_WAIT_MS = 60_000L
  fun isConnecting(): Boolean = connectingSinceMs > 0 && System.currentTimeMillis() - connectingSinceMs < CONNECT_WAIT_MS
  fun startConnecting(label: String?) { exotelLabel = label; connectingSinceMs = System.currentTimeMillis(); dialIntentUntilMs = connectingSinceMs + DIAL_INTENT_MS; answerIntentUntilMs = connectingSinceMs + ANSWER_INTENT_MS; onChanged?.invoke() }

  /**
   * Call was pressed a moment ago, so a ringing call that nothing has armed for yet is almost certainly Exotel's, arriving before the server's reply. Such a call is
   * HELD (no incoming screen, no heads-up) for up to HOLD_MS while the app arms; if it is not answered by then it is shown as a normal incoming call.
   */
  @Volatile private var dialIntentUntilMs: Long = 0L
  const val DIAL_INTENT_MS = 8_000L
  /** How long after Call a ringing call from an already-known Exotel caller ID is answered even if no attempt is armed any more (single use). */
  @Volatile private var answerIntentUntilMs: Long = 0L
  const val ANSWER_INTENT_MS = 45_000L
  fun answerIntentActive(): Boolean = System.currentTimeMillis() < answerIntentUntilMs
  fun consumeAnswerIntent() { answerIntentUntilMs = 0L }
  const val HOLD_MS = 2_500L
  private val held = HashSet<Call>()
  fun dialIntentActive(): Boolean = System.currentTimeMillis() < dialIntentUntilMs
  @Synchronized fun hold(c: Call) { held.add(c) }
  @Synchronized fun release(c: Call) { held.remove(c) }
  @Synchronized fun isHeld(c: Call): Boolean = held.contains(c)
  fun stopConnecting() { connectingSinceMs = 0L; answerIntentUntilMs = 0L; onChanged?.invoke() } // End Call / a failed dial: nothing is coming, so nothing is answered

  @Synchronized fun add(c: Call) { calls.add(c); connectingSinceMs = 0L; onChanged?.invoke() } // a call exists now: the screen follows it
  @Synchronized fun remove(c: Call) { calls.remove(c); exotel.remove(c); held.remove(c); if (exotel.isEmpty()) exotelLabel = null; onChanged?.invoke() }
  @Synchronized fun markExotel(c: Call) { exotel.add(c) }
  @Synchronized fun isExotel(c: Call): Boolean = exotel.contains(c)
  @Synchronized fun all(): List<Call> = calls.toList()
  /** Call.getState() is deprecated from API 31 in favour of Call.Details.getState(); both give the same value. */
  @Suppress("DEPRECATION")
  fun stateOf(c: Call): Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) c.details.state else c.state

  @Synchronized fun current(): Call? = calls.lastOrNull { stateOf(it) != Call.STATE_DISCONNECTED }
  @Synchronized fun isLive(c: Call) = stateOf(c) != Call.STATE_DISCONNECTED && stateOf(c) != Call.STATE_DISCONNECTING

  /** `exotel` is true only for a call this app auto-answered. `number` is sent ONLY in learn mode (to find out what Exotel shows), never otherwise. */
  fun emit(type: String, exotel: Boolean, state: String, number: String? = null) {
    sink?.invoke(mapOf("type" to type, "exotel" to exotel, "state" to state, "number" to number))
  }
}
