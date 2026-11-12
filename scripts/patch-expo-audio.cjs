const fs = require('node:fs');
const path = require('node:path');

const root = process.env.WAVEPLAY_EXPO_AUDIO_ROOT || path.resolve(__dirname, '../node_modules/expo-audio');
const servicePath = path.join(root, 'android/src/main/java/expo/modules/audio/service/AudioControlsService.kt');
const callbackPath = path.join(root, 'android/src/main/java/expo/modules/audio/service/AudioMediaSessionCallback.kt');
if (!fs.existsSync(servicePath) || !fs.existsSync(callbackPath)) process.exit(0);

function replace(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`expo-audio 57.0.5 cambió: no se encontró ${label}.`);
  return source.replace(before, after);
}

let callback = fs.readFileSync(callbackPath, 'utf8');
if (!callback.includes('onWavePlayAction')) {
  callback = replace(callback, 'class AudioMediaSessionCallback : MediaSession.Callback {', 'class AudioMediaSessionCallback(\n  private val onWavePlayAction: (String) -> Unit = {}\n) : MediaSession.Callback {', 'callback');
  callback = replace(callback, '.add(SessionCommand(AudioControlsService.ACTION_SEEK_FORWARD, Bundle.EMPTY))', '.add(SessionCommand(AudioControlsService.ACTION_SEEK_FORWARD, Bundle.EMPTY))\n            .add(SessionCommand(AudioControlsService.ACTION_PREVIOUS, Bundle.EMPTY))\n            .add(SessionCommand(AudioControlsService.ACTION_NEXT, Bundle.EMPTY))\n            .add(SessionCommand(AudioControlsService.ACTION_FAVORITE, Bundle.EMPTY))', 'comandos');
  callback = replace(callback, '      AudioControlsService.ACTION_SEEK_BACKWARD -> {\n        session.player.seekTo(session.player.currentPosition - AudioControlsService.SEEK_INTERVAL_MS)\n      }', '      AudioControlsService.ACTION_SEEK_BACKWARD -> {\n        session.player.seekTo(session.player.currentPosition - AudioControlsService.SEEK_INTERVAL_MS)\n      }\n      AudioControlsService.ACTION_PREVIOUS -> onWavePlayAction("previous")\n      AudioControlsService.ACTION_NEXT -> onWavePlayAction("next")\n      AudioControlsService.ACTION_FAVORITE -> onWavePlayAction("favorite")', 'acciones');
  fs.writeFileSync(callbackPath, callback);
}

let service = fs.readFileSync(servicePath, 'utf8');
if (!service.includes('WAVEPLAY_BROADCAST_ACTION')) {
  service = replace(service, 'import expo.modules.audio.Metadata\n', 'import expo.modules.audio.Metadata\nimport expo.modules.audio.R\n', 'recurso');
  service = replace(service, '  private var currentArtwork: Bitmap? = null\n', '  private var currentArtwork: Bitmap? = null\n  private var currentFavorite = false\n', 'estado favorito');
  service = replace(service, '  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {\n    ensureForegroundNotification()\n', '  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {\n    if (intent?.action == ACTION_SET_FAVORITE) {\n      currentFavorite = intent.getBooleanExtra(EXTRA_FAVORITE, false)\n      currentPlayer?.ref?.let { player ->\n        appContext?.mainQueue?.launch {\n          updateSessionCustomLayout(player.isPlaying)\n          postOrStartForegroundNotification(startInForeground = false)\n        }\n      }\n      return super.onStartCommand(intent, flags, startId)\n    }\n\n    ensureForegroundNotification()\n', 'sincronizacion favorita');
  service = replace(service, '        ACTION_SEEK_BACKWARD -> currentPlayerRef.seekTo(currentPlayerRef.currentPosition - SEEK_INTERVAL_MS)\n', '        ACTION_SEEK_BACKWARD -> currentPlayerRef.seekTo(currentPlayerRef.currentPosition - SEEK_INTERVAL_MS)\n        ACTION_PREVIOUS -> sendWavePlayAction("previous")\n        ACTION_NEXT -> sendWavePlayAction("next")\n        ACTION_FAVORITE -> sendWavePlayAction("favorite")\n', 'intents');
  service = replace(service, '  private fun buildNotification(): Notification? {', '  private fun sendWavePlayAction(action: String) {\n    sendBroadcast(Intent(WAVEPLAY_BROADCAST_ACTION).setPackage(packageName).putExtra(WAVEPLAY_ACTION_EXTRA, action))\n  }\n\n  private fun buildNotification(): Notification? {', 'broadcast');
  service = service.replace(/      if \(currentOptions\?\.showSeekBackward == true\) \{[\s\S]*?        currentIndex\+\+\n      \}\n\n      builder\.addAction/, '      builder.addAction(NotificationCompat.Action(androidx.media3.session.R.drawable.media3_icon_previous, "Anterior", buildActionPendingIntent(ACTION_PREVIOUS)))\n      compactViewIndices.add(currentIndex++)\n\n      builder.addAction');
  service = service.replace(/      if \(currentOptions\?\.showSeekForward == true\) \{[\s\S]*?      \}\n\n      style\.setShowActionsInCompactView/, '      builder.addAction(NotificationCompat.Action(androidx.media3.session.R.drawable.media3_icon_next, "Siguiente", buildActionPendingIntent(ACTION_NEXT)))\n      compactViewIndices.add(currentIndex++)\n      builder.addAction(NotificationCompat.Action(R.drawable.waveplay_media_heart, if (currentFavorite) "Quitar de favoritas" else "Añadir a favoritas", buildActionPendingIntent(ACTION_FAVORITE)))\n\n      style.setShowActionsInCompactView');
  service = service.replace(/    \/\/ Add seek backward button if enabled[\s\S]*?    \}\n\n    \/\/ Add play\/pause button/, '    mediaButtons.add(\n      CommandButton.Builder(CommandButton.ICON_PREVIOUS)\n        .setDisplayName("Anterior")\n        .setEnabled(true)\n        .setSessionCommand(SessionCommand(ACTION_PREVIOUS, Bundle.EMPTY))\n        .setSlots(CommandButton.SLOT_BACK)\n        .build()\n    )\n\n    // Add play/pause button');
  service = service.replace(/    \/\/ Add seek forward button if enabled[\s\S]*?    \}\n\n    session\.setCustomLayout/, '    mediaButtons.add(\n      CommandButton.Builder(CommandButton.ICON_NEXT)\n        .setDisplayName("Siguiente")\n        .setEnabled(true)\n        .setSessionCommand(SessionCommand(ACTION_NEXT, Bundle.EMPTY))\n        .setSlots(CommandButton.SLOT_FORWARD)\n        .build()\n    )\n    mediaButtons.add(\n      CommandButton.Builder(if (currentFavorite) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED)\n        .setDisplayName(if (currentFavorite) "Quitar de favoritas" else "Añadir a favoritas")\n        .setEnabled(true)\n        .setSessionCommand(SessionCommand(ACTION_FAVORITE, Bundle.EMPTY))\n        .setSlots(CommandButton.SLOT_OVERFLOW)\n        .build()\n    )\n\n    session.setCustomLayout');
  service = service.replaceAll('AudioMediaSessionCallback()', 'AudioMediaSessionCallback(::sendWavePlayAction)');
  service = replace(service, '    const val ACTION_SEEK_BACKWARD = "expo.modules.audio.action.SEEK_BACKWARD"\n', '    const val ACTION_SEEK_BACKWARD = "expo.modules.audio.action.SEEK_BACKWARD"\n    const val ACTION_PREVIOUS = "com.waveplay.app.action.PREVIOUS"\n    const val ACTION_NEXT = "com.waveplay.app.action.NEXT"\n    const val ACTION_FAVORITE = "com.waveplay.app.action.FAVORITE"\n    const val ACTION_SET_FAVORITE = "com.waveplay.app.action.SET_FAVORITE"\n    private const val EXTRA_FAVORITE = "favorite"\n    private const val WAVEPLAY_BROADCAST_ACTION = "com.waveplay.app.MEDIA_ACTION"\n    private const val WAVEPLAY_ACTION_EXTRA = "action"\n', 'constantes');
  if (!service.includes('CommandButton.ICON_HEART_FILLED') || service.includes('ICON_SKIP_BACK_10')) throw new Error('La personalización de la notificación quedó incompleta.');
  fs.writeFileSync(servicePath, service);
}

const drawableDir = path.join(root, 'android/src/main/res/drawable');
fs.mkdirSync(drawableDir, { recursive: true });
fs.writeFileSync(path.join(drawableDir, 'waveplay_media_heart.xml'), `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.04L12,21.35Z" />
</vector>\n`);


// Media3 1.9 distinguishes cached/local files from network streams.
const playerPath = path.join(root, 'android/src/main/java/expo/modules/audio/AudioPlayer.kt');
if (fs.existsSync(playerPath)) {
  let player = fs.readFileSync(playerPath, 'utf8');
  if (!player.includes('setBufferDurationsMsForLocalPlayback')) {
    const start = player.indexOf('    .apply {');
    const end = player.indexOf('    .build(),', start);
    if (start < 0 || end < 0) throw new Error('expo-audio 57.0.5 cambió: configuración de buffer desconocida.');
    player = player.slice(0, start) + `    .apply {
      val loadControl = DefaultLoadControl.Builder()
      if (bufferDurationMs > 0) {
        loadControl.setBufferDurationsMsForStreaming(
          DefaultLoadControl.DEFAULT_MIN_BUFFER_MS,
          bufferDurationMs.toInt().coerceAtLeast(DefaultLoadControl.DEFAULT_MIN_BUFFER_MS),
          DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,
          DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS
        )
      }
      // Keep normal read-ahead, but resume local seeks with a small ready buffer.
      loadControl.setBufferDurationsMsForLocalPlayback(
        DefaultLoadControl.DEFAULT_MIN_BUFFER_FOR_LOCAL_PLAYBACK_MS,
        DefaultLoadControl.DEFAULT_MAX_BUFFER_FOR_LOCAL_PLAYBACK_MS,
        125,
        500
      )
      loadControl.setBackBuffer(10_000, false)
      setLoadControl(loadControl.build())
    }
` + player.slice(end);
    fs.writeFileSync(playerPath, player);
  }
}

// Standard Media3 commands are used by wired/Bluetooth headsets, unlike custom buttons.
callback = fs.readFileSync(callbackPath, 'utf8');
for (const command of ['PREVIOUS_MEDIA_ITEM', 'NEXT_MEDIA_ITEM', 'PREVIOUS', 'NEXT']) {
  callback = callback.replace(`.remove(Player.COMMAND_SEEK_TO_${command})`, `.add(Player.COMMAND_SEEK_TO_${command})`);
}
callback = callback.replace('// Remove track navigation commands', '// Forward track navigation to the WavePlay queue');
fs.writeFileSync(callbackPath, callback);
const metadataPath = path.join(path.dirname(servicePath), 'MetadataInjectingPlayer.kt');
if (fs.existsSync(metadataPath)) {
  let metadata = fs.readFileSync(metadataPath, 'utf8');
  if (!metadata.includes('listener.onAvailableCommandsChanged(this@MetadataInjectingPlayer.availableCommands)')) {
    metadata = replace(metadata, '    override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {', `    override fun onAvailableCommandsChanged(availableCommands: Player.Commands) {
      listener.onAvailableCommandsChanged(this@MetadataInjectingPlayer.availableCommands)
    }

    override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {`, 'headset command changes');
    fs.writeFileSync(metadataPath, metadata);
  }

  if (!metadata.includes('onWavePlayAction')) {
    metadata = replace(metadata, '  player: Player\n', '  player: Player,\n  private val onWavePlayAction: (String) -> Unit = {}\n', 'queue player');
    metadata = replace(metadata, '  override fun addListener(listener: Player.Listener) {', `  override fun getAvailableCommands(): Player.Commands = super.getAvailableCommands().buildUpon()
    .add(Player.COMMAND_SEEK_TO_NEXT).add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
    .add(Player.COMMAND_SEEK_TO_PREVIOUS).add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM).build()

  override fun isCommandAvailable(command: Int): Boolean = availableCommands.contains(command)
  override fun seekToNext() { onWavePlayAction("next") }
  override fun seekToNextMediaItem() { onWavePlayAction("next") }
  override fun seekToPrevious() { onWavePlayAction("previous") }
  override fun seekToPreviousMediaItem() { onWavePlayAction("previous") }

  override fun addListener(listener: Player.Listener) {`, 'headset forwarding');
    fs.writeFileSync(metadataPath, metadata);
  }
}
service = fs.readFileSync(servicePath, 'utf8');
service = service.replaceAll('MetadataInjectingPlayer(resolveSessionPlayer(player, options))', 'MetadataInjectingPlayer(resolveSessionPlayer(player, options), ::sendWavePlayAction)');
if (!service.includes('refreshWavePlayArtwork')) {
  // Publish title immediately: a shared album cover must never suppress a metadata notification.
  service = service.replace(/    metadata\?\.artworkUrl\?\.let \{\n      loadArtworkFromUrl\(it\) \{ bitmap ->\n        currentArtwork = bitmap\n        postOrStartForegroundNotification\(startInForeground = false\)\n      \}\n    \}/g, '    refreshWavePlayArtwork()');
  service = replace(service, `    currentMetadata?.artworkUrl?.let {
      loadArtworkFromUrl(it) { bitmap ->
        currentArtwork = bitmap
        postOrStartForegroundNotification(startInForeground = false)
      }
    } ?: postOrStartForegroundNotification(startInForeground = false)`, '    refreshWavePlayArtwork()', 'immediate metadata');
  service = service.replace(/      metadata\?\.artworkUrl\?\.let \{\n        loadArtworkFromUrl\(it\) \{ bitmap ->\n          currentArtwork = bitmap\n          postOrStartForegroundNotification\(startInForeground = false\)\n        \}\n      \}/g, '      refreshWavePlayArtwork()');
  service = replace(service, '  private fun loadArtworkFromUrl(url: URL, callback: (Bitmap?) -> Unit) {', `  private fun refreshWavePlayArtwork() {
    val expected = currentMetadata?.artworkUrl
    if (expected != currentArtworkUrl) {
      artworkLoadJob?.cancel()
      currentArtwork = null
      currentArtworkUrl = null
    }
    postOrStartForegroundNotification(startInForeground = false)
    if (expected != null) loadArtworkFromUrl(expected) { bitmap ->
      appContext?.mainQueue?.launch {
        if (currentMetadata?.artworkUrl == expected && currentArtworkUrl == expected) {
          currentArtwork = bitmap
          postOrStartForegroundNotification(startInForeground = false)
        }
      }
    }
  }

  private fun loadArtworkFromUrl(url: URL, callback: (Bitmap?) -> Unit) {`, 'artwork refresh');
  service = replace(service, '          val inputStream = url.openConnection().getInputStream()\n          val bitmap = BitmapFactory.decodeStream(inputStream)', '          val connection = url.openConnection().apply { connectTimeout = 5000; readTimeout = 5000 }\n          val bitmap = connection.getInputStream().use { BitmapFactory.decodeStream(it) }', 'artwork resource');
  service = service.replaceAll('        val context = appContext?.reactContext ?: return@launch\n        val sessionPlayer', '        if (currentPlayer !== player) return@launch\n        val context = appContext?.reactContext ?: return@launch\n        val sessionPlayer');
  service = service.replaceAll('          updateMetadata(metadata)', '          updateMetadata(currentMetadata)');
}
fs.writeFileSync(servicePath, service);
