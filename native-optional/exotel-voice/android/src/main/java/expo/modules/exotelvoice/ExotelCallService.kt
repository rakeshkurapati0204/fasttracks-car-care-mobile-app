package expo.modules.exotelvoice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that keeps the call's audio alive while the app is in the background (declared with foregroundServiceType phoneCall|microphone by
 * plugins/with-exotel-voice.js). The notification it shows is an ONGOING-CALL notification ("Call in progress"): low importance, silent, no sound, no
 * full-screen intent, no Answer action. It is NOT an incoming-call notification.
 */
class ExotelCallService : Service() {
  companion object {
    private const val CHANNEL_ID = "ft_voip_call"
    private const val NOTIFICATION_ID = 7101
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Calls in progress", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null) })
    }
    val notification: Notification = Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("Call in progress")
      .setSmallIcon(android.R.drawable.sym_action_call)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_CALL)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return START_NOT_STICKY
  }
}
