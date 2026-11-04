package expo.modules.fasttracksdialer

import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telecom.TelecomManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS name "FasttracksDialer". The React Native side can: ask the user to make Fasttracks the phone app (Android shows its own approval dialog), arm ONE
 * click-to-call attempt (caller IDs + a short window; the NATIVE clock sets the expiry), disarm, switch learn mode, and listen to call events. All decisions
 * about answering live in [AutoAnswerPolicy] and run in [FtInCallService], which works even when the app is not running.
 */
class FasttracksDialerModule : Module() {
  companion object {
    private const val REQUEST_ROLE = 7301
  }

  private var rolePromise: Promise? = null

  private val context: Context get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("FasttracksDialer")
    Events("onCallEvent")

    OnCreate { CallRegistry.sink = { event -> sendEvent("onCallEvent", event) } }
    OnDestroy { CallRegistry.sink = null }

    Function("isDefaultDialer") { isDefault() }

    Function("getStatus") {
      val p = PendingStore.peek(context)
      mapOf(
        "isDefaultDialer" to isDefault(),
        "sdkInt" to Build.VERSION.SDK_INT,
        "armed" to (p != null && System.currentTimeMillis() < p.expiresAtMs),
        "learnOnly" to (p?.learnOnly ?: false),
      )
    }

    // Shows Android's own "Set Fasttracks as your phone app?" dialog. Resolves true only if the user approved.
    AsyncFunction("requestDialerRole") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) { promise.reject("NO_ACTIVITY", "No screen is available to ask the user.", null); return@AsyncFunction }
      if (isDefault()) { promise.resolve(true); return@AsyncFunction }
      val intent: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val rm = activity.getSystemService(RoleManager::class.java)
        if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_DIALER)) rm.createRequestRoleIntent(RoleManager.ROLE_DIALER) else null
      } else {
        Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER).putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, activity.packageName)
      }
      if (intent == null) { promise.reject("ROLE_UNAVAILABLE", "This phone cannot use another phone app.", null); return@AsyncFunction }
      rolePromise = promise
      activity.startActivityForResult(intent, REQUEST_ROLE)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == REQUEST_ROLE) {
        rolePromise?.resolve(payload.resultCode == Activity.RESULT_OK && isDefault())
        rolePromise = null
      }
    }

    // Arms ONE attempt. Returns false (and arms nothing) unless Fasttracks is the phone app and at least one caller ID has 10+ digits.
    Function("armAutoAnswer") { callerIds: List<String>, windowSeconds: Int ->
      val tails = callerIds.mapNotNull { AutoAnswerPolicy.tail(it) }.toSet()
      if (!isDefault() || tails.isEmpty()) return@Function false
      val windowMs = (windowSeconds.coerceIn(1, 180)) * 1000L
      PendingStore.register(context, tails, System.currentTimeMillis() + windowMs, learn)
      true
    }

    Function("disarmAutoAnswer") { PendingStore.clear(context) }

    // The customer's number or name for the call screen of the click-to-call call that is about to arrive. Cleared when that call ends.
    Function("setCallLabel") { label: String -> CallRegistry.exotelLabel = label.take(64).ifBlank { null } }

    // Learn mode: while on, a matching call is NOT answered; its number is reported to the app so the real caller ID can be checked on the first device test.
    Function("setLearnMode") { on: Boolean -> learn = on }
  }

  private var learn = false

  private fun isDefault(): Boolean = context.getSystemService(TelecomManager::class.java)?.defaultDialerPackage == context.packageName
}
