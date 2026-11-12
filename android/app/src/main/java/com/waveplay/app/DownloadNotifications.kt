package com.waveplay.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.liseth.audiopermitido.R

object DownloadNotifications {
  private const val CHANNEL = "waveplay_downloads"
  fun update(context: Context, jobId: String, title: String, state: String, progress: Double) {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "Descargas de WavePlay", NotificationManager.IMPORTANCE_LOW).apply { description = "Progreso y resultado de tus descargas"; setSound(null, null) })
    }
    val labels = mapOf("queued" to "En cola", "downloading" to "Descargando", "converting" to "Preparando audio", "embedding" to "Añadiendo portada", "saving" to "Guardando", "done" to "Lista para escuchar", "error" to "No se pudo descargar", "cancelled" to "Descarga cancelada")
    val terminal = state in listOf("done", "error", "cancelled")
    val intent = Intent(context, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP; data = android.net.Uri.parse("waveplay://downloads") }
    val pending = PendingIntent.getActivity(context, jobId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_waveplay_notification)
      .setContentTitle(title).setContentText(labels[state] ?: "Procesando audio").setContentIntent(pending)
      .setOnlyAlertOnce(true).setSilent(true).setOngoing(!terminal).setAutoCancel(terminal)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
    if (!terminal) notification.setProgress(100, progress.toInt().coerceIn(0, 100), state != "downloading")
    try { manager.notify("waveplay-download", jobId.hashCode(), notification.build()) } catch (_: SecurityException) { /* User denied notifications. Downloads remain visible in-app. */ }
  }
}
