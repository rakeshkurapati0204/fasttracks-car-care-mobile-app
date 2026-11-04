package expo.modules.fasttracksdialer

import android.content.Context

/**
 * The single armed attempt, kept in SharedPreferences so it survives the app process being killed while the salesman waits for Exotel's call (the
 * InCallService is started by Telecom even when the app is not running). One attempt at a time: arming again replaces it. Cleared on use, on expiry and
 * on disarm. Only digit strings are stored, never a name or a customer number.
 */
object PendingStore {
  private const val PREFS = "ft_dialer_pending"
  private const val KEY_TAILS = "tails"
  private const val KEY_EXPIRES = "expires"
  private const val KEY_LEARN = "learn"

  @Synchronized
  fun register(ctx: Context, tails: Set<String>, expiresAtMs: Long, learnOnly: Boolean) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putStringSet(KEY_TAILS, tails).putLong(KEY_EXPIRES, expiresAtMs).putBoolean(KEY_LEARN, learnOnly).apply()
  }

  @Synchronized
  fun peek(ctx: Context): PendingAttempt? {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val tails = p.getStringSet(KEY_TAILS, null) ?: return null
    return PendingAttempt(tails.toSet(), p.getLong(KEY_EXPIRES, 0L), p.getBoolean(KEY_LEARN, false))
  }

  @Synchronized
  fun clear(ctx: Context) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }
}
