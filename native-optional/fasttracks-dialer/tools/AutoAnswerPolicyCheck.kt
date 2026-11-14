package expo.modules.fasttracksdialer

import kotlin.system.exitProcess

// Checks every branch of AutoAnswerPolicy.decide on a plain JVM (no Android, no phone). Run: tools/run-policy-check.sh
// The property that matters most: a call is answered ONLY with an armed, unexpired attempt, a caller ID that matches exactly (last 10 digits) and no other call live.

private var failures = 0
private fun check(name: String, actual: Decision, expected: Decision) {
  val ok = actual == expected
  if (!ok) failures++
  println("${if (ok) "PASS" else "FAIL"}  $name${if (ok) "" else "  (got $actual, wanted $expected)"}")
}

fun main() {
  val now = 1_000_000L
  val exotel = "08040001234"
  val attempt = PendingAttempt(callerTails = setOf("8040001234"), expiresAtMs = now + 45_000)
  fun decide(number: String?, a: PendingAttempt? = attempt, busy: Boolean = false, at: Long = now) = AutoAnswerPolicy.decide(number, a, at, busy)

  check("no armed attempt: normal call", decide(exotel, a = null), Decision.NO_ATTEMPT)
  check("expired attempt", decide(exotel, at = now + 45_000), Decision.EXPIRED)
  check("expired long ago", decide(exotel, at = now + 999_999), Decision.EXPIRED)
  check("window too far in the future is as bad as expired", decide(exotel, a = attempt.copy(expiresAtMs = now + AutoAnswerPolicy.MAX_WINDOW_MS + 1)), Decision.EXPIRED)
  check("window of exactly the maximum is allowed", decide(exotel, a = attempt.copy(expiresAtMs = now + AutoAnswerPolicy.MAX_WINDOW_MS)), Decision.ANSWER)
  check("hidden number", decide(null), Decision.UNKNOWN_NUMBER)
  check("number shorter than 10 digits", decide("12345"), Decision.UNKNOWN_NUMBER)
  check("another call is live: never answer", decide(exotel, busy = true), Decision.BUSY)
  check("a personal call from another number is not answered", decide("+919848012345"), Decision.NUMBER_MISMATCH)
  check("a number that differs in one digit is not answered", decide("08040001235"), Decision.NUMBER_MISMATCH)
  check("attempt with no caller IDs answers nothing", decide(exotel, a = attempt.copy(callerTails = emptySet())), Decision.NUMBER_MISMATCH)
  check("exact caller ID is answered", decide(exotel), Decision.ANSWER)
  check("same number written +91 80 4000 1234 is answered", decide("+91 80 4000 1234"), Decision.ANSWER)
  check("same number with a 91 prefix and no plus is answered", decide("918040001234"), Decision.ANSWER)
  check("a longer number whose LAST 10 digits match is answered (country code)", decide("+918040001234"), Decision.ANSWER)
  check("match plus busy: busy wins", decide("+918040001234", busy = true), Decision.BUSY)
  val learn = attempt.copy(learnOnly = true)
  check("learn mode reports and never answers (matching number)", decide(exotel, a = learn), Decision.LEARN_ONLY)
  check("learn mode reports and never answers (other number)", decide("+919848012345", a = learn), Decision.LEARN_ONLY)
  check("learn mode with an expired window is just expired", decide(exotel, a = learn, at = now + 60_000), Decision.EXPIRED)
  check("tail of a short number is null", if (AutoAnswerPolicy.tail("12345") == null) Decision.ANSWER else Decision.BUSY, Decision.ANSWER)

  println(if (failures == 0) "\nall branches ok" else "\n$failures FAILED")
  exitProcess(if (failures == 0) 0 else 1)
}
