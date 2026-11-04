package expo.modules.exotelvoice

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS name "ExotelVoice". Mirrors the app's VoipEngine interface (src/lib/voip/types.ts) one to one, so the JS engine in src/lib/voip/native-engine.ts is a thin
 * adapter. SKELETON: [SDK_ENABLED] is false, so initialize() refuses and no call can be placed or answered. Wiring to Exotel's SDK goes in [ExotelBridge].
 *
 * Contract (see VoipEngine.armIncoming in types.ts), identical for the mock and for this module:
 *  - never show an incoming-call screen, never ring, never post an incoming-call notification;
 *  - answer the agent leg silently, and ONLY while armed for the matching callRef; otherwise reject it;
 *  - events sent to JS: "agent_leg" (answered), "ringing", "established", "ended", "failed" (each with an optional reason).
 */
class ExotelVoiceModule : Module() {
  companion object {
    /** Flip to true only after Exotel confirms the architecture and the SDK AAR is added to build.gradle. */
    const val SDK_ENABLED = false
  }

  private var bridge: ExotelBridge? = null

  override fun definition() = ModuleDefinition {
    Name("ExotelVoice")
    Events("onVoipEvent")

    Constants("sdkEnabled" to SDK_ENABLED)

    AsyncFunction("initialize") { hostname: String, accountSid: String, subscriberName: String, displayName: String, subscriberToken: String, promise: Promise ->
      if (!SDK_ENABLED) {
        promise.reject("NATIVE_SDK_DISABLED", "The Exotel SDK is not linked in this build.", null)
        return@AsyncFunction
      }
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise.reject("NO_CONTEXT", "The app context is not available.", null)
        return@AsyncFunction
      }
      bridge = ExotelBridge(ctx) { type, reason -> sendEvent("onVoipEvent", mapOf("type" to type, "reason" to reason)) }
      bridge?.initialize(hostname, accountSid, subscriberName, displayName, subscriberToken)
      promise.resolve(null)
    }

    Function("armIncoming") { callRef: String -> bridge?.armIncoming(callRef) }
    Function("disarmIncoming") { bridge?.disarmIncoming() }
    Function("hangup") { bridge?.hangup() }
    Function("mute") { on: Boolean -> bridge?.mute(on) }
    Function("speaker") { on: Boolean -> bridge?.speaker(on) }

    OnDestroy { bridge?.release(); bridge = null }
  }
}
