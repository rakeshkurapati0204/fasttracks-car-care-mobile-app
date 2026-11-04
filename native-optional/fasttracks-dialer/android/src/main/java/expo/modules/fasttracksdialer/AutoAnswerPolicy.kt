package expo.modules.fasttracksdialer

/** One armed click-to-call attempt: the caller IDs (last 10 digits) the Exotel call may show, and the moment it stops being trusted. Single use. */
data class PendingAttempt(val callerTails: Set<String>, val expiresAtMs: Long, val learnOnly: Boolean = false)

enum class Decision {
  /** Answer silently and consume the attempt. */
  ANSWER,
  /** Learn mode: any call that rings inside the window is reported to the app (number included), NOT answered, and rings normally. */
  LEARN_ONLY,
  NO_ATTEMPT, EXPIRED, BUSY, UNKNOWN_NUMBER, NUMBER_MISMATCH,
}

/**
 * The ONE place that decides whether an incoming call is answered automatically. Pure (no Android classes) so it can be unit tested on a JVM.
 * Learn mode (a test aid, off by default) never answers: it only reports. Rules, all required for ANSWER: an armed attempt that has not expired; a caller number that is present and has at least 10 digits; its last 10 digits equal
 * one of the attempt's caller IDs EXACTLY; and no other call is in progress. Anything else is a normal call: ringtone, Answer and Reject.
 * There is deliberately no "answer unknown numbers" or "answer anything while armed" path.
 */
object AutoAnswerPolicy {
  const val MIN_DIGITS = 10
  const val MAX_WINDOW_MS = 180_000L

  fun tail(number: String?): String? {
    val digits = number?.filter { it.isDigit() } ?: return null
    return if (digits.length >= MIN_DIGITS) digits.takeLast(MIN_DIGITS) else null
  }

  fun decide(incomingNumber: String?, attempt: PendingAttempt?, nowMs: Long, otherCallActive: Boolean): Decision {
    if (attempt == null) return Decision.NO_ATTEMPT
    if (nowMs >= attempt.expiresAtMs || attempt.expiresAtMs - nowMs > MAX_WINDOW_MS) return Decision.EXPIRED // too far in the future is as bad as expired
    if (attempt.learnOnly) return Decision.LEARN_ONLY // test aid: report whatever rings inside the window (to learn Exotel's real caller ID); never answers
    val incoming = tail(incomingNumber) ?: return Decision.UNKNOWN_NUMBER
    if (otherCallActive) return Decision.BUSY
    if (attempt.callerTails.isEmpty() || incoming !in attempt.callerTails) return Decision.NUMBER_MISMATCH
    return Decision.ANSWER
  }
}
