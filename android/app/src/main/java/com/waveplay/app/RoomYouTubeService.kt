package com.waveplay.app

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.media.*
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.*
import android.view.View
import android.view.ViewGroup
import android.webkit.*
import android.widget.FrameLayout
import com.liseth.audiopermitido.R
import org.json.JSONObject

/** One process-owned browser. React screens only borrow its display surface. */
object RoomYouTubeEngine {
  var browser: WebView? = null
  var service: RoomYouTubeService? = null
  var sink: ((String) -> Unit)? = null
  var config: JSONObject? = null
  var background = false
  var ready = false
  var interrupted = false
  var position = 0.0
  var playerState = -1
  private var receivedAt = 0L
  private var suppressPauseUntil = 0L
  private var lastProgressForwarded = 0L
  private var loadedId = ""
  private val main = Handler(Looper.getMainLooper())

  fun emit(type: String, extra: JSONObject = JSONObject()) {
    extra.put("type", type).put("id", config?.optString("itemId") ?: "")
      .put("revision", config?.optLong("revision") ?: -1)
    sink?.invoke(extra.toString())
  }

  fun attach(parent: FrameLayout) {
    // Fabric can drop a displayed surface while its disappearing child still
    // retains a parent during a transition. Finish that transition before reuse.
    val view = browser ?: object : WebView(parent.context) {
      override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(if (RoomYouTubeEngine.background) View.VISIBLE else visibility)
      }
      override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, if (RoomYouTubeEngine.background) View.VISIBLE else visibility)
      }
    }.apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.mediaPlaybackRequiresUserGesture = false
      settings.allowFileAccess = false
      settings.allowContentAccess = false
      settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      addJavascriptInterface(object {
        @JavascriptInterface fun postMessage(raw: String) {
          if (raw.length > 2048) return
          main.post {
            try {
              val event = JSONObject(raw)
              if (event.optString("id") != config?.optString("itemId")) return@post
              when (event.optString("type")) {
                "ready" -> { ready = true; apply() }
                "progress" -> {
                  val value = event.optDouble("position", -1.0)
                  if (value.isFinite() && value >= 0) position = value
                  playerState = event.optInt("state", -1)
                }
                "state" -> {
                  val previous = playerState
                  playerState = event.optInt("state", -1)
                  // Chromium owns audio focus. Do not compete with its focus client.
                  if (playerState == 2 && previous == 1 && SystemClock.elapsedRealtime() > suppressPauseUntil && config?.optBoolean("playing") == true) interrupt()
                  service?.updateNotification()
                }
                "error" -> { interrupted = true; service?.releaseWakeLock() }
              }
              if (event.optString("type") != "progress" || config?.optBoolean("visualActive") == true || SystemClock.elapsedRealtime() - lastProgressForwarded >= 2000) {
                if (event.optString("type") == "progress") lastProgressForwarded = SystemClock.elapsedRealtime()
                sink?.invoke(raw)
              }
            } catch (_: Exception) { }
          }
        }
      }, "WavePlayRoomBridge")
      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
          val host = request.url.host ?: ""
          return request.isForMainFrame && host != "waveplay.app" && request.url.toString() != "about:blank"
        }
        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
          if (request.isForMainFrame) emit("error", JSONObject().put("code", 0))
        }
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
          emit("error", JSONObject().put("code", 0)); stop(); return true
        }
      }
      webChromeClient = WebChromeClient()
    }.also { browser = it }
    fun fit() {
      if (view.parent !== parent || parent.width <= 0 || parent.height <= 0) return
      view.measure(View.MeasureSpec.makeMeasureSpec(parent.width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(parent.height, View.MeasureSpec.EXACTLY))
      view.layout(0, 0, parent.width, parent.height)
      view.invalidate()
    }
    if (view.parent === parent) { fit(); parent.post { fit() }; loadIfNeeded(); return }
    // Detaching the video surface can produce a transient Chromium pause.
    // Keep it separate from genuine focus/headphone interruptions.
    val relocating = view.parent != null && background && config?.optBoolean("playing") == true && !interrupted
    if (relocating) suppressPauseUntil = SystemClock.elapsedRealtime() + 500
    (view.parent as? ViewGroup)?.let { previous ->
      previous.removeView(view)
      previous.endViewTransition(view)
    }
    // Never add a child still owned by a transitioning/detaching container.
    if (view.parent != null) { emit("backgroundError"); return }
    parent.addView(view, FrameLayout.LayoutParams(-1, -1))
    fit(); parent.post { fit() }; parent.requestLayout()
    loadIfNeeded()
    if (relocating) parent.post {
      if (view.parent === parent && !interrupted && config?.optBoolean("playing") == true) apply()
    }
  }

  fun configure(context: Context, raw: String, html: String) {
    val next = JSONObject(raw)
    require(next.optString("videoId").matches(Regex("[A-Za-z0-9_-]{11}")))
    require(next.optDouble("position", -1.0).let { it.isFinite() && it >= 0 })
    val changed = config?.optString("itemId") != next.optString("itemId")
    val localPlayCommand = next.optString("route") == "online-player" && next.optBoolean("playing") && config?.optLong("revision") != next.optLong("revision")
    config = next.put("html", html)
    receivedAt = SystemClock.elapsedRealtime()
    if (changed) { suppressPauseUntil = SystemClock.elapsedRealtime() + 2000; interrupted = false; position = next.optDouble("position"); }
    if (localPlayCommand) { interrupted = false; suppressPauseUntil = SystemClock.elapsedRealtime() + 2000 }
    background = next.optBoolean("background")
    if (browser == null) (RoomYouTubeSurfaceManager.displayed ?: RoomYouTubeSurfaceManager.surface)?.let { attach(it) }
    loadIfNeeded()
    if (background && next.optBoolean("playing") && service == null) {
      val intent = Intent(context, RoomYouTubeService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      } catch (_: Exception) { emit("backgroundError") }
    } else if (!background) service?.stopSelf()
    apply(); service?.updateNotification()
  }

  private fun loadIfNeeded() {
    val data = config ?: return
    val id = data.optString("itemId")
    if (loadedId == id || browser == null) return
    if (ready && loadedId.isNotEmpty()) {
      loadedId = id
      val video = JSONObject.quote(data.optString("videoId"))
      val item = JSONObject.quote(id)
      browser?.evaluateJavascript("window.changeRoomVideo&&window.changeRoomVideo($video,$item);true;", null)
      apply(); return
    }
    loadedId = id; ready = false
    browser?.loadDataWithBaseURL("https://waveplay.app", data.optString("html"), "text/html", "UTF-8", null)
  }

  fun apply() {
    val data = config ?: return
    if (!ready) return
    val elapsed = if (data.optBoolean("playing")) (SystemClock.elapsedRealtime() - receivedAt) / 1000.0 else 0.0
    val target = JSONObject().put("position", (data.optDouble("position") + elapsed).coerceIn(0.0, data.optDouble("duration").coerceAtLeast(0.0)))
      .put("playing", data.optBoolean("playing") && !interrupted).put("revision", data.optLong("revision"))
    browser?.evaluateJavascript("window.applyRoom&&window.applyRoom($target);true;", null)
  }

  fun interrupt() {
    interrupted = true
    browser?.evaluateJavascript("window.pauseLocal&&window.pauseLocal();true;", null)
    service?.releaseWakeLock(); service?.updateNotification(); emit("interrupted")
  }

  fun resumeLocal() { interrupted = false; apply(); service?.updateNotification() }

  fun stop() {
    config = null; ready = false; loadedId = ""; background = false
    browser?.let { (it.parent as? ViewGroup)?.removeView(it); it.stopLoading(); it.destroy() }
    browser = null; service?.stopSelf()
  }
}

class RoomYouTubeService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var media: MediaSession
  private var wakeLock: PowerManager.WakeLock? = null
  private var lastRefresh = 0L
  private var pausedAt = 0L
  private val noisy = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) { RoomYouTubeEngine.interrupt() }
  }
  private val tick = object : Runnable {
    override fun run() {
      if (RoomYouTubeEngine.config == null) { stopSelf(); return }
      RoomYouTubeEngine.apply()
      val now = SystemClock.elapsedRealtime()
      if (now - lastRefresh >= 15000) { lastRefresh = now; RoomYouTubeEngine.emit("refresh") }
      if (!RoomYouTubeEngine.config!!.optBoolean("playing") || RoomYouTubeEngine.interrupted) {
        if (pausedAt == 0L) pausedAt = now
        // Keep the media session available while room membership is active; no wake lock when paused.
      } else pausedAt = 0L
      handler.postDelayed(this, 8000)
    }
  }

  override fun onCreate() {
    super.onCreate(); RoomYouTubeEngine.service = this
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, "Sala de música", NotificationManager.IMPORTANCE_LOW))
    media = MediaSession(this, "WavePlayRoom").apply {
      setCallback(object : MediaSession.Callback() {
        override fun onPlay() { action("play") }
        override fun onPause() { action("pause") }
        override fun onSkipToNext() { action("next") }
        override fun onSkipToPrevious() { action("previous") }
        override fun onSeekTo(pos: Long) { if (RoomYouTubeEngine.config?.optBoolean("canControl") == true) RoomYouTubeEngine.emit("action", JSONObject().put("action", "seek").put("position", pos / 1000.0)) }
        override fun onStop() { RoomYouTubeEngine.interrupt() }
      }, handler)
      isActive = true
    }
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), RECEIVER_NOT_EXPORTED)
    else { @Suppress("DEPRECATION") registerReceiver(noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)) }
    updateNotification(); handler.post(tick)
  }

  private fun action(value: String) {
    if (value == "resumeLocal") { RoomYouTubeEngine.resumeLocal(); return }
    if (value == "play") RoomYouTubeEngine.resumeLocal()
    if (RoomYouTubeEngine.config?.optBoolean("canControl") == true) RoomYouTubeEngine.emit("action", JSONObject().put("action", value))
    else if (value == "pause") RoomYouTubeEngine.interrupt()
    else if (value == "play") RoomYouTubeEngine.resumeLocal()
  }

  private fun pending(action: String, code: Int) = PendingIntent.getService(this, code,
    Intent(this, RoomYouTubeService::class.java).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun updateNotification() {
    val data = RoomYouTubeEngine.config ?: return
    val playing = data.optBoolean("playing") && !RoomYouTubeEngine.interrupted
    val controller = data.optBoolean("canControl")
    val individual = data.optString("route") == "online-player"
    val hasNext = !individual || data.optBoolean("canNext")
    val actions = PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_STOP or
      if (controller) (if (hasNext) PlaybackState.ACTION_SKIP_TO_NEXT else 0L) or PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_SEEK_TO else 0L
    media.setPlaybackState(PlaybackState.Builder().setActions(actions)
      .setState(if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED, (RoomYouTubeEngine.position * 1000).toLong(), if (playing) 1f else 0f).build())
    media.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, data.optString("title"))
      .putString(MediaMetadata.METADATA_KEY_ARTIST, data.optString("artist"))
      .putLong(MediaMetadata.METADATA_KEY_DURATION, (data.optDouble("duration") * 1000).toLong()).build())
    val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
      .setData(android.net.Uri.parse(if (data.optString("route") == "online-player") "waveplay:///online-player" else "waveplay:///friends")), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else { @Suppress("DEPRECATION") Notification.Builder(this) }
    builder.setSmallIcon(R.drawable.waveplay_room_notification).setContentTitle(data.optString("title"))
      .setContentText("YouTube · " + data.optString("artist")).setContentIntent(open)
      .setOnlyAlertOnce(true).setOngoing(playing).setVisibility(Notification.VISIBILITY_PUBLIC)
      .setCategory(Notification.CATEGORY_TRANSPORT)
    if (controller) builder.addAction(Notification.Action.Builder(android.R.drawable.ic_media_previous, "Anterior", pending("previous", 1)).build())
    builder.addAction(Notification.Action.Builder(if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
      if (playing) "Pausar" else "Reproducir", pending(if (playing) "pause" else "play", 2)).build())
    if (controller && hasNext) builder.addAction(Notification.Action.Builder(android.R.drawable.ic_media_next, "Siguiente", pending("next", 3)).build())
    builder.setStyle(Notification.MediaStyle().setMediaSession(media.sessionToken).setShowActionsInCompactView(*if (controller && hasNext) intArrayOf(0, 1, 2) else if (controller) intArrayOf(0, 1) else intArrayOf(0)))
    if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(NOTIFICATION, builder.build())
    if (playing) {
      if (wakeLock?.isHeld != true) wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WavePlay:YouTubeRoom").apply { acquire(30 * 60 * 1000L) }
    } else releaseWakeLock()
  }

  fun releaseWakeLock() { if (wakeLock?.isHeld == true) wakeLock?.release(); wakeLock = null }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    intent?.action?.let { action(it) }; return START_NOT_STICKY
  }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null); releaseWakeLock()
    media.isActive = false; media.release(); unregisterReceiver(noisy)
    RoomYouTubeEngine.service = null
    super.onDestroy()
  }
  companion object { private const val CHANNEL = "waveplay-youtube-room"; private const val NOTIFICATION = 4703 }
}
