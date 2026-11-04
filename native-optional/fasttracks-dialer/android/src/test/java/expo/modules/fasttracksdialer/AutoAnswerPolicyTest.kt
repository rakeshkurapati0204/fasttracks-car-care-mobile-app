package expo.modules.fasttracksdialer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AutoAnswerPolicyTest {
  private val now = 1_000_000L
  private val exoPhone = "+914045901128"
  private fun attempt(expiresIn: Long = 60_000, learn: Boolean = false) = PendingAttempt(setOf(AutoAnswerPolicy.tail(exoPhone)!!), now + expiresIn, learn)

  @Test fun answersTheExophoneWithALiveAttempt() {
    assertEquals(Decision.ANSWER, AutoAnswerPolicy.decide(exoPhone, attempt(), now, false))
  }

  @Test fun theCallerIdMayComeInAnyCommonFormat() {
    for (n in listOf("+914045901128", "914045901128", "04045901128", "040 4590 1128", "tel:+91-40-4590-1128".removePrefix("tel:"))) {
      assertEquals(n, Decision.ANSWER, AutoAnswerPolicy.decide(n, attempt(), now, false))
    }
  }

  @Test fun neverAnswersWithoutAnAttempt() {
    assertEquals(Decision.NO_ATTEMPT, AutoAnswerPolicy.decide(exoPhone, null, now, false))
  }

  @Test fun neverAnswersAnExpiredAttempt() {
    assertEquals(Decision.EXPIRED, AutoAnswerPolicy.decide(exoPhone, attempt(expiresIn = 0), now, false))
    assertEquals(Decision.EXPIRED, AutoAnswerPolicy.decide(exoPhone, attempt(expiresIn = -5), now, false))
  }

  @Test fun anAttemptCannotBeTrustedForMoreThanThreeMinutes() {
    assertEquals(Decision.EXPIRED, AutoAnswerPolicy.decide(exoPhone, attempt(expiresIn = 10 * 60_000), now, false))
  }

  @Test fun aPersonalNumberIsNeverAnswered_evenWhileArmed() {
    assertEquals(Decision.NUMBER_MISMATCH, AutoAnswerPolicy.decide("+919876543210", attempt(), now, false))
    assertEquals(Decision.NUMBER_MISMATCH, AutoAnswerPolicy.decide("+914045901129", attempt(), now, false)) // one digit off
  }

  @Test fun hiddenOrShortNumbersAreNeverAnswered() {
    assertEquals(Decision.UNKNOWN_NUMBER, AutoAnswerPolicy.decide(null, attempt(), now, false))
    assertEquals(Decision.UNKNOWN_NUMBER, AutoAnswerPolicy.decide("", attempt(), now, false))
    assertEquals(Decision.UNKNOWN_NUMBER, AutoAnswerPolicy.decide("1128", attempt(), now, false)) // a broad "ends with" rule would match this
    assertEquals(Decision.UNKNOWN_NUMBER, AutoAnswerPolicy.decide("Private", attempt(), now, false))
  }

  @Test fun aSecondCallWhileAnotherIsInProgressIsNeverAutoAnswered() {
    assertEquals(Decision.BUSY, AutoAnswerPolicy.decide(exoPhone, attempt(), now, true))
  }

  @Test fun learnModeReportsAnyCallInsideTheWindow_andNeverAnswers() {
    assertEquals(Decision.LEARN_ONLY, AutoAnswerPolicy.decide(exoPhone, attempt(learn = true), now, false))
    assertEquals(Decision.LEARN_ONLY, AutoAnswerPolicy.decide("+919876543210", attempt(learn = true), now, false)) // the real caller ID may differ from the ExoPhone
    assertEquals(Decision.LEARN_ONLY, AutoAnswerPolicy.decide(null, attempt(learn = true), now, false))
  }

  @Test fun learnModeStillHonoursExpiryAndNoAttempt() {
    assertEquals(Decision.EXPIRED, AutoAnswerPolicy.decide(exoPhone, attempt(expiresIn = 0, learn = true), now, false))
    assertEquals(Decision.NO_ATTEMPT, AutoAnswerPolicy.decide(exoPhone, null, now, false))
  }

  @Test fun anEmptyCallerIdListMatchesNothing() {
    assertEquals(Decision.NUMBER_MISMATCH, AutoAnswerPolicy.decide(exoPhone, PendingAttempt(emptySet(), now + 1000), now, false))
  }

  @Test fun tailKeepsOnlyTheLastTenDigits() {
    assertEquals("4045901128", AutoAnswerPolicy.tail("+91 40459 01128"))
    assertNull(AutoAnswerPolicy.tail("12345"))
    assertNull(AutoAnswerPolicy.tail(null))
  }
}
