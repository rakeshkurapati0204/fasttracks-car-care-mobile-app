package expo.modules.fasttracksdialer

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.telecom.TelecomManager

/**
 * Required of a phone app: it handles ACTION_DIAL / ACTION_VIEW for tel: links ("call this number" from contacts, web pages, other apps), so ordinary SIM
 * calling keeps working when Fasttracks is the phone app. ACTION_DIAL means "show this number, let the user decide": it asks "Call <number>?" and only
 * places the call (through Telecom, which also covers emergency numbers) after the user taps Call. With no number it just opens the Fasttracks app.
 * It never auto-answers anything.
 */
class DialerActivity : Activity() {
  private var pending: Uri? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val uri = intent?.data
    if (uri == null || uri.scheme != "tel") { openApp(); return }
    pending = uri
    AlertDialog.Builder(this)
      .setTitle("Call ${uri.schemeSpecificPart}?")
      .setPositiveButton("Call") { _, _ -> placeOrAsk() }
      .setNegativeButton("Cancel") { _, _ -> finish() }
      .setOnCancelListener { finish() }
      .show()
  }

  private fun placeOrAsk() {
    if (checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) place()
    else requestPermissions(arrayOf(Manifest.permission.CALL_PHONE), REQUEST_CALL)
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQUEST_CALL && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) place() else finish()
  }

  private fun place() {
    pending?.let { getSystemService(TelecomManager::class.java).placeCall(it, Bundle()) }
    finish()
  }

  private fun openApp() {
    packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }
    finish()
  }

  companion object { private const val REQUEST_CALL = 7401 }
}
