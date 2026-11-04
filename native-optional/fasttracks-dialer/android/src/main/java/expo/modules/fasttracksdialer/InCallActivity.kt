package expo.modules.fasttracksdialer

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.PowerManager
import android.os.Looper
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.VideoProfile
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The call screen of a modern phone app, black with round controls: who you are talking to, a running timer, Mute / Keypad / Speaker / Hold and a red End
 * button; Decline / Accept while a call rings. The Keypad sends real DTMF tones (menus, extensions). Plain views on purpose: it must open instantly on a
 * locked screen without waiting for React Native. Closes itself when no call is left.
 * For a click-to-call (Exotel) call the Android call is with the company line, so the title shows the customer the salesman dialled (CallRegistry.exotelLabel).
 */
class InCallActivity : Activity() {
  /** One round control: the circle with its icon, and the caption underneath. */
  private class Ctl(val box: LinearLayout, val circle: FrameLayout, val icon: ImageView, val label: TextView)

  private lateinit var title: TextView
  private lateinit var status: TextView
  private lateinit var subtitle: TextView
  private lateinit var grid: LinearLayout
  private lateinit var keypad: LinearLayout
  private lateinit var typed: TextView
  private lateinit var ringingRow: LinearLayout
  private lateinit var endRow: LinearLayout
  private lateinit var muteCtl: Ctl
  private lateinit var keypadCtl: Ctl
  private lateinit var speakerCtl: Ctl
  private lateinit var holdCtl: Ctl
  private var keypadOpen = false
  private val digits = StringBuilder()
  private var proximity: PowerManager.WakeLock? = null
  private val ui = Handler(Looper.getMainLooper())
  private val tick = object : Runnable { override fun run() { render(); ui.postDelayed(this, 1000) } }

  private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun disc(color: Int) = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(color) }

  private fun caption(text: String) = TextView(this).apply {
    this.text = text; setTextColor(Color.WHITE); setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f); gravity = Gravity.CENTER; setPadding(0, dp(8), 0, 0)
  }

  /** A round button with an icon and a caption; [size] in dp. */
  private fun control(iconRes: Int, text: String, size: Int, color: Int, onClick: () -> Unit): Ctl {
    val icon = ImageView(this).apply {
      setImageResource(iconRes); setColorFilter(Color.WHITE)
      layoutParams = FrameLayout.LayoutParams(dp(size * 2 / 5), dp(size * 2 / 5), Gravity.CENTER)
    }
    val circle = FrameLayout(this).apply {
      background = disc(color); isClickable = true; isFocusable = true; contentDescription = text
      setOnClickListener { onClick() }
      addView(icon)
      layoutParams = LinearLayout.LayoutParams(dp(size), dp(size))
    }
    val label = caption(text)
    val box = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
      addView(circle); addView(label)
      layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(dp(8), dp(12), dp(8), dp(12)) }
    }
    return Ctl(box, circle, icon, label)
  }

  private fun tone(c: Ctl, on: Boolean) {
    c.circle.background = disc(if (on) Color.WHITE else OFF)
    c.icon.setColorFilter(if (on) Color.BLACK else Color.WHITE)
  }

  private fun row(vararg items: View) = LinearLayout(this).apply {
    orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER
    for (v in items) addView(v)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) { setShowWhenLocked(true); setTurnScreenOn(true) }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) // on speaker the salesman looks at the screen; the proximity lock below turns it off at the ear
    window.statusBarColor = Color.BLACK
    window.navigationBarColor = Color.BLACK
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setBackgroundColor(Color.BLACK); setPadding(dp(20), dp(80), dp(20), dp(44)) }

    title = TextView(this).apply { setTextColor(Color.WHITE); setTextSize(TypedValue.COMPLEX_UNIT_SP, 34f); gravity = Gravity.CENTER; maxLines = 2 }
    status = TextView(this).apply { setTextColor(Color.parseColor("#C7C7CC")); setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f); gravity = Gravity.CENTER; setPadding(0, dp(8), 0, 0) }
    subtitle = TextView(this).apply { setTextColor(Color.parseColor("#8E8E93")); setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f); gravity = Gravity.CENTER; setPadding(0, dp(6), 0, 0) }
    for (v in listOf(title, status, subtitle)) root.addView(v, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    root.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f)) // flexible space: the controls sit in the lower part of the screen

    muteCtl = control(R.drawable.ft_ic_mic_off, "Mute", 76, OFF) { FtInCallService.instance?.setMuted(!isMuted()); render() }
    keypadCtl = control(R.drawable.ft_ic_dialpad, "Keypad", 76, OFF) { keypadOpen = true; render() }
    speakerCtl = control(R.drawable.ft_ic_volume, "Speaker", 76, OFF) { toggleSpeaker(); render() }
    holdCtl = control(R.drawable.ft_ic_pause, "Hold", 76, OFF) { toggleHold(); render() }
    grid = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      addView(row(muteCtl.box, keypadCtl.box, speakerCtl.box))
      addView(row(holdCtl.box, View(this@InCallActivity).apply { layoutParams = LinearLayout.LayoutParams(0, 0, 2f) }))
    }
    root.addView(grid, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

    keypad = buildKeypad()
    root.addView(keypad, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

    val end = control(R.drawable.ft_ic_call_end, "", 72, RED) { CallRegistry.current()?.disconnect() }
    end.label.visibility = View.GONE
    endRow = row(end.box).apply { setPadding(0, dp(20), 0, 0) }
    root.addView(endRow, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

    val decline = control(R.drawable.ft_ic_call_end, "Decline", 72, RED) { CallRegistry.current()?.reject(false, null) }
    val accept = control(R.drawable.ft_ic_call, "Accept", 72, GREEN) { CallRegistry.current()?.answer(VideoProfile.STATE_AUDIO_ONLY) }
    ringingRow = row(decline.box, accept.box)
    root.addView(ringingRow, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    setContentView(root)
  }

  /** A 3x4 dial pad that sends real DTMF tones, with the typed digits above it and a Hide link below. */
  private fun buildKeypad(): LinearLayout {
    val pad = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
    typed = TextView(this).apply { setTextColor(Color.WHITE); setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f); gravity = Gravity.CENTER; minHeight = dp(40) }
    pad.addView(typed, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    for (keys in listOf("123", "456", "789", "*0#")) {
      val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
      for (ch in keys) {
        val key = TextView(this).apply {
          text = ch.toString(); setTextColor(Color.WHITE); setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f); gravity = Gravity.CENTER
          background = disc(OFF); isClickable = true; isFocusable = true; contentDescription = ch.toString()
          setOnClickListener { sendDtmf(ch) }
          layoutParams = LinearLayout.LayoutParams(dp(68), dp(68)).apply { setMargins(dp(12), dp(6), dp(12), dp(6)) }
        }
        r.addView(key)
      }
      pad.addView(r)
    }
    val hide = TextView(this).apply {
      text = "Hide"; setTextColor(Color.WHITE); setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f); setTypeface(typeface, Typeface.BOLD); gravity = Gravity.CENTER
      setPadding(dp(24), dp(14), dp(24), dp(6)); isClickable = true; contentDescription = "Hide keypad"
      setOnClickListener { keypadOpen = false; render() }
    }
    pad.addView(hide)
    return pad
  }

  private fun sendDtmf(ch: Char) {
    val call = CallRegistry.current() ?: return
    digits.append(ch); typed.text = digits.toString()
    call.playDtmfTone(ch)
    ui.postDelayed({ call.stopDtmfTone() }, 160)
  }

  override fun onResume() { super.onResume(); CallRegistry.onChanged = { runOnUiThread { render() } }; ui.post(tick) }
  override fun onPause() { ui.removeCallbacks(tick); CallRegistry.onChanged = null; syncProximity(false); super.onPause() }
  override fun onDestroy() { syncProximity(false); super.onDestroy() }

  /** Screen off while the phone is at the ear (earpiece, no keypad), on again when it is taken away: the same behaviour as the stock call screen. */
  private fun syncProximity(wanted: Boolean) {
    val pm = getSystemService(PowerManager::class.java) ?: return
    if (!wanted) { proximity?.let { if (it.isHeld) it.release() }; return }
    if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return
    val lock = proximity ?: pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "fasttracks:incall").also { it.setReferenceCounted(false); proximity = it }
    if (!lock.isHeld) lock.acquire(2 * 60 * 60 * 1000L) // 2 h safety limit; released on pause, destroy and when the call ends
  }

  @Suppress("DEPRECATION")
  private fun isMuted(): Boolean = FtInCallService.instance?.callAudioState?.isMuted ?: false

  @Suppress("DEPRECATION")
  private fun speakerOn(): Boolean = FtInCallService.instance?.callAudioState?.route == CallAudioState.ROUTE_SPEAKER

  @Suppress("DEPRECATION")
  private fun toggleSpeaker() {
    // Back to "earpiece or a wired headset", which Telecom resolves to whatever this phone has (a plain ROUTE_EARPIECE can be refused when a headset is plugged in).
    FtInCallService.instance?.setAudioRoute(if (speakerOn()) CallAudioState.ROUTE_WIRED_OR_EARPIECE else CallAudioState.ROUTE_SPEAKER)
  }

  private fun toggleHold() {
    val call = CallRegistry.current() ?: return
    if (CallRegistry.stateOf(call) == Call.STATE_HOLDING) call.unhold() else if (canHold(call)) call.hold()
  }

  private fun canHold(call: Call) = call.details?.can(Call.Details.CAPABILITY_HOLD) == true

  private fun clock(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    return String.format("%02d:%02d", s / 60, s % 60)
  }

  private fun render() {
    val call = CallRegistry.current()
    if (call == null) { finish(); return }
    val state = CallRegistry.stateOf(call)
    val number = call.details?.handle?.schemeSpecificPart
    val label = CallRegistry.exotelLabel
    val isClickToCall = label != null && CallRegistry.isExotel(call)
    title.text = if (isClickToCall) label else (number ?: "Unknown number")
    subtitle.text = if (isClickToCall) "Fasttracks call · recorded" else ""
    val connectedAt = call.details?.connectTimeMillis ?: 0L
    status.text = when (state) {
      Call.STATE_RINGING -> "is calling"
      Call.STATE_DIALING, Call.STATE_CONNECTING -> "Calling..."
      Call.STATE_HOLDING -> "On hold"
      Call.STATE_ACTIVE -> if (connectedAt > 0) clock(System.currentTimeMillis() - connectedAt) else "Connected"
      else -> "Ending..."
    }
    val ringing = state == Call.STATE_RINGING
    ringingRow.visibility = if (ringing) View.VISIBLE else View.GONE
    endRow.visibility = if (ringing) View.GONE else View.VISIBLE
    grid.visibility = if (!ringing && !keypadOpen) View.VISIBLE else View.GONE
    keypad.visibility = if (!ringing && keypadOpen) View.VISIBLE else View.GONE
    tone(muteCtl, isMuted())
    tone(speakerCtl, speakerOn())
    tone(holdCtl, state == Call.STATE_HOLDING)
    holdCtl.label.text = if (state == Call.STATE_HOLDING) "Resume" else "Hold"
    holdCtl.box.alpha = if (canHold(call) || state == Call.STATE_HOLDING) 1f else 0.4f
    syncProximity(!ringing && !keypadOpen && !speakerOn() && (state == Call.STATE_ACTIVE || state == Call.STATE_DIALING || state == Call.STATE_CONNECTING))
  }

  private companion object {
    val OFF: Int = Color.parseColor("#2C2C2E")
    val RED: Int = Color.parseColor("#FF3B30")
    val GREEN: Int = Color.parseColor("#34C759")
  }
}
