package com.waveplay.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.liseth.audiopermitido.R
import java.util.concurrent.ConcurrentHashMap

/** Owns the foreground lifetime of user-requested transfers, including conversion. */
class DownloadTaskService : Service() {
  companion object {
    private const val CHANNEL = "waveplay_download_worker"
    private const val NOTIFICATION = 8464
    private val jobs = ConcurrentHashMap<String, () -> Unit>()
    @Synchronized fun acquire(context: Context, id: String, cancel: () -> Unit) {
      jobs[id] = cancel
      try { ContextCompat.startForegroundService(context, Intent(context, DownloadTaskService::class.java)) }
      catch (error: Exception) { jobs.remove(id); throw error }
    }
    @Synchronized fun release(context: Context, id: String) {
      jobs.remove(id)
      if (jobs.isEmpty()) context.stopService(Intent(context, DownloadTaskService::class.java))
    }
  }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Motor de descargas", NotificationManager.IMPORTANCE_LOW))
    val launch = Intent(this, MainActivity::class.java).apply { data = android.net.Uri.parse("waveplay://downloads"); addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP) }
    val pending = PendingIntent.getActivity(this, NOTIFICATION, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_waveplay_notification).setContentTitle("Descargando música")
      .setContentText("Toca para ver el progreso").setContentIntent(pending).setOngoing(true).setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS).build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    else startForeground(NOTIFICATION, notification)
    if (jobs.isEmpty()) stopSelf()
    return START_NOT_STICKY
  }
  override fun onTimeout(startId: Int, fgsType: Int) {
    jobs.values.toList().forEach { it() }
    jobs.clear()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }
}
