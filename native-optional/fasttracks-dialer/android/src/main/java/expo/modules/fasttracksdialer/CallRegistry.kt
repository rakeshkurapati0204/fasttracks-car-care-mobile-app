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

  @Synchronized fun add(c: Call) { calls.add(c); onChanged?.invoke() }
  @Synchronized fun remove(c: Call) { calls.remove(c); exotel.remove(c); if (exotel.isEmpty()) exotelLabel = null; onChanged?.invoke() }
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
