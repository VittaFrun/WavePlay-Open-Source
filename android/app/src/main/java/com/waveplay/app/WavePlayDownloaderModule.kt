package com.waveplay.app

import android.app.Activity
import android.content.Intent
import android.content.ContentUris
import android.content.ContentValues
import com.facebook.react.bridge.BaseActivityEventListener
import android.graphics.BitmapFactory
import android.net.Uri
import android.net.Network
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.MediaStore
import android.media.MediaMetadataRetriever
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.jaudiotagger.audio.AudioFileIO
import org.jaudiotagger.tag.FieldKey
import java.io.File
import java.io.FileInputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantReadWriteLock
import org.json.JSONObject
import android.os.SystemClock

class WavePlayDownloaderModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newCachedThreadPool()
  private val downloadExecutor = Executors.newFixedThreadPool(2)
  private val downloadTitles = ConcurrentHashMap<String, String>()
  private val notificationStates = ConcurrentHashMap<String, String>()
  private val saveLocks = ConcurrentHashMap<String, Any>()
  private val formats = ConcurrentHashMap<String, String>()
  private val audioExtensions = setOf("mp3", "m4a", "opus", "ogg", "aac", "flac", "wav", "webm")
  private val wifiDownloads = ConcurrentHashMap<String, Boolean>()
  private val pendingDownloads = ConcurrentHashMap<String, AtomicBoolean>()
  private val updateLock = Any()
  private val engineLock = ReentrantReadWriteLock()
  private val cancellationExecutor = Executors.newSingleThreadScheduledExecutor()
  private val completedDownloads get() = context.getSharedPreferences("waveplay_download_results", 0)
  private var deletionPromise: Promise? = null
  private val deletionRequestCode = 8462
  private val editRequestCode = 8463
  private data class EditRequest(val uri: String, val extension: String, val title: String, val artist: String, val album: String, val genre: String, val promise: Promise)
  private var pendingEdit: EditRequest? = null
  init {
    executor.execute {
      // Maintenance must never block a transfer or mutate the extractor in use.
      if (engineLock.writeLock().tryLock()) {
        try { initializeEngine(false); updateEngineIfNeeded() }
        catch (_: Exception) { /* The bundled extractor remains available. */ }
        finally { engineLock.writeLock().unlock() }
      }
    }
    context.addActivityEventListener(object : BaseActivityEventListener() {
      override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == editRequestCode) {
          val edit = pendingEdit
          pendingEdit = null
          if (edit != null) {
            if (resultCode == Activity.RESULT_OK) executor.execute { writeAudioTags(edit) }
            else edit.promise.reject("EDIT_NOT_ALLOWED", "No se concedió permiso para modificar el archivo.")
          }
          return
        }
        if (requestCode != deletionRequestCode) return
        val pending = deletionPromise
        deletionPromise = null
        pending?.resolve(resultCode == Activity.RESULT_OK)
      }
    })
  }
  override fun getName() = "WavePlayDownloader"
  @ReactMethod fun updateDownloadNotification(jobId: String, title: String, state: String, progress: Double) {
    DownloadNotifications.update(context, jobId, title, state, progress)
  }
  @ReactMethod fun getArtworkFileUri(uri: String, promise: Promise) {
    try {
      val parsed = Uri.parse(uri)
      if (parsed.scheme == "https" || parsed.scheme == "http" || parsed.scheme == "file") { promise.resolve(uri); return }
      if (parsed.authority != "${context.packageName}.waveplay.files") { promise.resolve(null); return }
      val name = parsed.lastPathSegment ?: ""
      if (!name.matches(Regex("[a-f0-9]+\\.jpg"))) { promise.resolve(null); return }
      val file = listOf(File(context.filesDir, "waveplay-artwork/$name"), File(context.cacheDir, "waveplay-artwork/$name")).firstOrNull { it.isFile }
      promise.resolve(file?.let { Uri.fromFile(it).toString() })
    } catch (_: Exception) { promise.resolve(null) }
  }

  @ReactMethod fun deleteAudioAsset(assetId: String, promise: Promise) {
    context.runOnUiQueueThread {
      try {
        require(assetId.matches(Regex("[0-9]+"))) { "Identificador de audio inválido" }
        val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, assetId.toLong())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          check(deletionPromise == null) { "Ya hay una eliminación pendiente" }
          val activity = context.currentActivity ?: error("Abre WavePlay para confirmar la eliminación")
          val request = MediaStore.createDeleteRequest(context.contentResolver, listOf(uri))
          deletionPromise = promise
          activity.startIntentSenderForResult(request.intentSender, deletionRequestCode, null, 0, 0, 0)
        } else {
          promise.resolve(context.contentResolver.delete(uri, null, null) > 0)
        }
      } catch (error: Exception) {
        if (deletionPromise === promise) deletionPromise = null
        promise.reject("DELETE_AUDIO_FAILED", "No se pudo eliminar el audio: ${error.message}", error)
      }
    }
  }

  private fun initializeEngine(needFFmpeg: Boolean) {
    YoutubeDL.getInstance().init(context)
    if (needFFmpeg) FFmpeg.getInstance().init(context)
  }

  private fun updateEngineIfNeeded() = synchronized(updateLock) {
    val preferences = context.getSharedPreferences("waveplay_engine", 0)
    val now = System.currentTimeMillis()
    if (now - preferences.getLong("yt_dlp_last_update", 0L) < 24 * 60 * 60 * 1000L || now - preferences.getLong("yt_dlp_last_attempt", 0L) < 60 * 60 * 1000L) return@synchronized
    preferences.edit().putLong("yt_dlp_last_attempt", System.currentTimeMillis()).apply()
    try {
      YoutubeDL.getInstance().updateYoutubeDL(context, YoutubeDL.UpdateChannel._STABLE)
      preferences.edit()
        .putLong("yt_dlp_last_update", System.currentTimeMillis())
        .putString("yt_dlp_version", YoutubeDL.getInstance().versionName(context))
        .apply()
    } catch (_: Exception) {
      // La actualización no impide usar la copia incluida cuando no hay red.
    }
  }

  @ReactMethod fun updateEngine(promise: Promise) = executor.execute {
    engineLock.writeLock().lock()
    try {
      YoutubeDL.getInstance().init(context)
      YoutubeDL.getInstance().updateYoutubeDL(context, YoutubeDL.UpdateChannel._STABLE)
      val version = YoutubeDL.getInstance().versionName(context)
      context.getSharedPreferences("waveplay_engine", 0).edit().putLong("yt_dlp_last_update", System.currentTimeMillis()).putString("yt_dlp_version", version).apply()
      promise.resolve(version)
    } catch (e: Exception) { promise.reject("UPDATE_ERROR", e.message ?: "No se pudo actualizar yt-dlp", e) }
    finally { engineLock.writeLock().unlock() }
  }

  @ReactMethod fun isOnWifi(promise: Promise) {
    try {
      val manager = context.getSystemService(ConnectivityManager::class.java)
      val network = manager.activeNetwork
      val capabilities = network?.let { manager.getNetworkCapabilities(it) }
      promise.resolve(capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true)
    } catch (error: Exception) {
      promise.reject("NETWORK_STATE", "No se pudo comprobar la conexión.", error)
    }
  }

  private val audioStreams = ConcurrentHashMap<String, AtomicBoolean>()
  @ReactMethod fun resolveAudioStream(videoId: String, jobId: String, promise: Promise) {
    if (!videoId.matches(Regex("[A-Za-z0-9_-]{11}")) || !jobId.matches(Regex("stream-[0-9]+-[0-9]+"))) { promise.reject("INVALID_STREAM", "Canción inválida"); return }
    val cancelled = AtomicBoolean(false)
    if (audioStreams.putIfAbsent(jobId, cancelled) != null) { promise.reject("DUPLICATE_STREAM", "El audio ya se está preparando"); return }
    executor.execute {
      engineLock.readLock().lock()
      try {
        check(!cancelled.get()) { "Preparación cancelada" }
        initializeEngine(false)
        val request = YoutubeDLRequest("https://www.youtube.com/watch?v=$videoId").apply {
          addOption("--no-playlist"); addOption("--skip-download"); addOption("--dump-single-json")
          addOption("--format", "bestaudio[ext=m4a]/bestaudio")
          addOption("--socket-timeout", "10"); addOption("--retries", "1"); addOption("--extractor-retries", "1")
          addOption("--match-filter", "!is_live & !is_upcoming")
        }
        val result = YoutubeDL.getInstance().execute(request, jobId, null)
        check(!cancelled.get()) { "Preparación cancelada" }
        val info = JSONObject(result.out)
        val uri = Uri.parse(info.getString("url")); val host = uri.host?.lowercase() ?: ""
        check(uri.scheme == "https" && (host == "googlevideo.com" || host.endsWith(".googlevideo.com"))) { "La fuente de audio no es válida" }
        check(!info.optBoolean("has_drm", false)) { "Este audio no está disponible" }
        val headers = Arguments.createMap(); val sourceHeaders = info.optJSONObject("http_headers")
        sourceHeaders?.keys()?.forEach { key ->
          val value = sourceHeaders.optString(key)
          if (key.lowercase() in setOf("user-agent", "referer", "origin", "accept", "accept-language") && !value.contains('\r') && !value.contains('\n')) headers.putString(key, value)
        }
        promise.resolve(Arguments.createMap().apply { putString("url", uri.toString()); putMap("headers", headers) })
      } catch (_: Exception) { promise.reject("AUDIO_STREAM_FAILED", if (cancelled.get()) "Preparación cancelada" else "No se pudo obtener el audio de esta canción.") }
      finally { audioStreams.remove(jobId); engineLock.readLock().unlock() }
    }
  }
  @ReactMethod fun cancelAudioStream(jobId: String, promise: Promise) {
    val flag = audioStreams[jobId]
    if (flag != null) {
      flag.set(true)
      val task = cancellationExecutor.scheduleAtFixedRate({ if (audioStreams[jobId] === flag) try { YoutubeDL.getInstance().destroyProcessById(jobId) } catch (_: Exception) { } }, 0, 100, TimeUnit.MILLISECONDS)
      cancellationExecutor.schedule({ task.cancel(false) }, 30, TimeUnit.SECONDS)
    }
    promise.resolve(null)
  }

  @ReactMethod fun getPreview(url: String, promise: Promise) = executor.execute {
    engineLock.readLock().lock()
    try {
      // A preview only needs metadata; it never initializes FFmpeg.
      initializeEngine(false)
      val info = YoutubeDL.getInstance().getInfo(YoutubeDLRequest(url).apply { addOption("--no-playlist"); addOption("--socket-timeout", "20"); addOption("--retries", "2") })
      promise.resolve(Arguments.createMap().apply {
        putString("title", info.title ?: "Audio")
        putString("artist", info.uploader ?: "Artista desconocido")
        putString("uploader", info.uploader)
        putString("thumbnail", info.thumbnail)
        putDouble("duration", info.duration?.toDouble() ?: 0.0)
      })
    } catch (e: Exception) { promise.reject("PREVIEW_ERROR", e.message ?: "No se pudo obtener la vista previa", e) }
    finally { engineLock.readLock().unlock() }
  }

  @ReactMethod fun setDownloadTitle(jobId: String, title: String, promise: Promise) {
    downloadTitles[jobId] = title.take(200); promise.resolve(true)
  }
  @ReactMethod fun setDownloadFormat(jobId: String, format: String, promise: Promise) {
    if (format != "mp3" && format != "original") { promise.reject("INVALID_FORMAT", "Formato no admitido"); return }
    formats[jobId] = format; promise.resolve(true)
  }
  @ReactMethod fun setDownloadWifiOnly(jobId: String, enabled: Boolean, promise: Promise) {
    if (enabled) wifiDownloads[jobId] = true else wifiDownloads.remove(jobId)
    promise.resolve(true)
  }
  private fun onWifi(): Boolean {
    val manager = context.getSystemService(ConnectivityManager::class.java)
    return manager.activeNetwork?.let { manager.getNetworkCapabilities(it) }?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
  }
  @ReactMethod fun downloadAudio(jobId: String, url: String, quality: Int, promise: Promise) {
    val original = formats.remove(jobId) == "original"
    val cancelled = AtomicBoolean(false)
    if (pendingDownloads.putIfAbsent(jobId, cancelled) != null) { promise.reject("DOWNLOAD_DUPLICATE", "Esta descarga ya está en curso."); return }
    try { DownloadTaskService.acquire(context, jobId) { cancelled.set(true) } }
    catch (error: Exception) { pendingDownloads.remove(jobId, cancelled); wifiDownloads.remove(jobId); promise.reject("DOWNLOAD_BACKGROUND_ERROR", "Abre WavePlay para iniciar la descarga.", error); return }
    emit(jobId, 0.0, "queued")
    downloadExecutor.execute {
    var dir: File? = null
    var completed = false
    val wifiOnly = wifiDownloads.remove(jobId) == true
    val networkLost = AtomicBoolean(false)
    val manager = context.getSystemService(ConnectivityManager::class.java)
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
        if (network == manager.activeNetwork && !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) networkLost.set(true)
      }
      override fun onLost(network: Network) { if (!onWifi()) networkLost.set(true) }
    }
    var registered = false
    engineLock.readLock().lock()
    // Repeated cancellation closes the gap before yt-dlp registers its process.
    val cancellation = cancellationExecutor.scheduleWithFixedDelay({
      if (cancelled.get() || networkLost.get()) try { YoutubeDL.getInstance().destroyProcessById(jobId) } catch (_: Exception) { }
    }, 0, 100, TimeUnit.MILLISECONDS)
    try {
      check(!cancelled.get()) { "Descarga cancelada" }
      if (wifiOnly) {
        check(onWifi()) { "Conéctate a Wi-Fi para descargar esta canción." }
        manager.registerDefaultNetworkCallback(callback)
        registered = true
        check(onWifi()) { "Conéctate a Wi-Fi para descargar esta canción." }
      }
      initializeEngine(true)
      val jobDir = File(File(context.getExternalFilesDir(null), "WavePlayDownloads/jobs"), UUID.randomUUID().toString()).apply { mkdirs() }
      dir = jobDir
      check(!cancelled.get()) { "Descarga cancelada" }
      val request = YoutubeDLRequest(url).apply {
        addOption("--no-playlist")
        addOption("--socket-timeout", "20")
        addOption("--retries", "3")
        addOption("--fragment-retries", "3")
        addOption("--match-filter", "!is_live & !is_upcoming")
        addOption("--extract-audio")
        addOption("--audio-format", if (original) "best" else "mp3")
        if (!original) addOption("--audio-quality", "${quality}K")
        addOption("--embed-thumbnail")
        addOption("--convert-thumbnails", "jpg")
        addOption("--add-metadata")
        addOption("--output", File(jobDir, "%(title).180B.%(ext)s").absolutePath)
      }
      var lastProgressAt = 0L
      var lastState = "queued"
      YoutubeDL.getInstance().execute(request, jobId) { progress, _, line ->
        val state = when {
          line.contains("EmbedThumbnail", true) || line.contains("Adding thumbnail", true) || line.contains("Embedding", true) -> "embedding"
          line.contains("ExtractAudio", true) || line.contains("ffmpeg", true) -> "converting"
          else -> lastState.takeIf { it == "converting" || it == "embedding" } ?: "downloading"
        }
        val now = SystemClock.elapsedRealtime()
        if (!cancelled.get() && (state != lastState || now - lastProgressAt >= 200)) {
          emit(jobId, progress.toDouble(), state)
          lastProgressAt = now
        }
        lastState = state
      }
      check(!cancelled.get()) { "Descarga cancelada" }
      check(!networkLost.get()) { "Se perdió Wi-Fi. Reintenta la descarga al reconectarte." }
      val result = jobDir.listFiles()?.singleOrNull { it.extension.lowercase() in audioExtensions }
        ?: throw IllegalStateException("No se encontró el audio descargado")
      require(result.length() > 0) { "El archivo descargado está vacío" }
      val record = JSONObject().put("uri", Uri.fromFile(result).toString()).put("fileName", result.name)
      check(completedDownloads.edit().putString(jobId, record.toString()).commit()) { "No se pudo guardar el estado de la descarga" }
      emit(jobId, 100.0, "saving")
      completed = true
      promise.resolve(Arguments.createMap().apply { putString("uri", Uri.fromFile(result).toString()); putString("fileName", result.name) })
    } catch (e: Exception) { emit(jobId, 0.0, if (cancelled.get()) "cancelled" else "error"); promise.reject(if (cancelled.get()) "DOWNLOAD_CANCELLED" else "DOWNLOAD_ERROR", if (networkLost.get()) "Se perdió Wi-Fi. Reintenta la descarga al reconectarte." else e.message ?: "La descarga falló", e) }
    finally { if (registered) try { manager.unregisterNetworkCallback(callback) } catch (_: Exception) { }; cancellation.cancel(false); pendingDownloads.remove(jobId, cancelled); downloadTitles.remove(jobId); notificationStates.remove(jobId); DownloadTaskService.release(context, jobId); if (!completed) dir?.deleteRecursively(); engineLock.readLock().unlock() }
    }
  }

  @ReactMethod fun getDownloadJobs(promise: Promise) {
    try {
      val jobs = Arguments.createArray()
      val completed = completedDownloads.all
      for ((id, raw) in completed) {
        val record = JSONObject(raw as String)
        val file = temporaryDownload(record.getString("uri"))
        if (!file.isFile || file.length() == 0L) { completedDownloads.edit().remove(id).apply(); continue }
        jobs.pushMap(Arguments.createMap().apply {
          putString("id", id); putString("uri", record.getString("uri")); putString("fileName", record.getString("fileName"))
        })
      }
      for (id in pendingDownloads.keys) if (!completed.containsKey(id)) jobs.pushMap(Arguments.createMap().apply { putString("id", id) })
      promise.resolve(jobs)
    } catch (error: Exception) { promise.reject("DOWNLOAD_RECOVERY_ERROR", error.message, error) }
  }

  @ReactMethod fun cancelDownload(jobId: String, promise: Promise) {
    pendingDownloads[jobId]?.set(true)
    try { YoutubeDL.getInstance().destroyProcessById(jobId); promise.resolve(true) } catch (e: Exception) { promise.resolve(false) }
  }

  private fun temporaryDownload(uri: String): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Archivo temporal inválido" }
    val file = File(requireNotNull(parsed.path)).canonicalFile
    val root = File(context.getExternalFilesDir(null), "WavePlayDownloads/jobs").canonicalFile
    require(file.path.startsWith(root.path + File.separator) && file.parentFile?.parentFile == root && file.extension.lowercase() in audioExtensions) { "Archivo fuera de la carpeta temporal" }
    return file
  }

  @ReactMethod fun copyDownloadedAudio(source: String, destination: String, promise: Promise) = executor.execute {
    try {
      val file = temporaryDownload(source)
      val target = Uri.parse(destination)
      require(target.scheme == "content") { "Destino inválido" }
      require(file.isFile && file.length() > 0) { "El audio temporal no está disponible" }
      FileInputStream(file).use { input ->
        requireNotNull(context.contentResolver.openOutputStream(target, "wt")).use { output -> check(input.copyTo(output, 64 * 1024) == file.length()) { "El guardado quedó incompleto" } }
      }
      promise.resolve(true)
    } catch (e: Exception) { promise.reject("COPY_DOWNLOAD_ERROR", e.message, e) }
  }

  @ReactMethod fun saveDownloadedAudio(jobId: String, source: String, promise: Promise) = executor.execute {
    synchronized(saveLocks.getOrPut(jobId) { Any() }) {
    try {
      require(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { "Versión de Android no compatible" }
      val file = temporaryDownload(source)
      require(file.isFile && file.length() > 0) { "El audio temporal no está disponible" }
      val record = JSONObject(requireNotNull(completedDownloads.getString(jobId, null)))
      require(record.getString("uri") == source) { "La descarga no corresponde al trabajo" }
      val resolver = context.contentResolver
      val previous = record.optString("mediaUri")
      val target = if (previous.isNotEmpty()) Uri.parse(previous) else {
        val mime = when (file.extension.lowercase()) {
          "mp3" -> "audio/mpeg"; "m4a" -> "audio/mp4"; "opus", "ogg" -> "audio/ogg"
          "aac" -> "audio/aac"; "flac" -> "audio/flac"; "wav" -> "audio/wav"; else -> "audio/webm"
        }
        val uri = requireNotNull(resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
          put(MediaStore.Audio.Media.DISPLAY_NAME, file.name)
          put(MediaStore.Audio.Media.MIME_TYPE, mime)
          put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/WavePlay")
          put(MediaStore.Audio.Media.IS_PENDING, 1)
        })) { "No se pudo crear el archivo de música" }
        record.put("mediaUri", uri.toString())
        if (!completedDownloads.edit().putString(jobId, record.toString()).commit()) {
          resolver.delete(uri, null, null)
          error("No se pudo registrar el destino")
        }
        uri
      }
      // Retry writes the same pending MediaStore row, including after process death.
      FileInputStream(file).use { input ->
        requireNotNull(resolver.openOutputStream(target, "wt")).use { output ->
          check(input.copyTo(output, 64 * 1024) == file.length()) { "El guardado quedó incompleto" }
        }
      }
      check(resolver.update(target, ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }, null, null) == 1) { "No se pudo finalizar el guardado" }
      promise.resolve(ContentUris.parseId(target).toString())
    } catch (error: Exception) { promise.reject("SAVE_DOWNLOAD_ERROR", "No se pudo guardar el audio: ${error.message}", error) }
    }
  }

  @ReactMethod fun releaseDownloadedAudio(uri: String, promise: Promise) = executor.execute {
    try {
      val file = temporaryDownload(uri)
      val matches = completedDownloads.all.filter { (_, raw) -> JSONObject(raw as String).optString("uri") == uri }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) for ((_, raw) in matches) {
        val mediaUri = JSONObject(raw as String).optString("mediaUri")
        if (mediaUri.isNotEmpty()) {
          val target = Uri.parse(mediaUri)
          context.contentResolver.query(target, arrayOf(MediaStore.Audio.Media.IS_PENDING), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst() && cursor.getInt(0) == 1) context.contentResolver.delete(target, null, null)
          }
        }
      }
      check(file.parentFile?.deleteRecursively() != false) { "No se pudo retirar el archivo temporal" }
      val edit = completedDownloads.edit()
      for ((id, _) in matches) { edit.remove(id); saveLocks.remove(id) }
      edit.apply(); promise.resolve(true)
    }
    catch (e: Exception) { promise.reject("RELEASE_DOWNLOAD_ERROR", e.message, e) }
  }

  @ReactMethod fun editAudioTags(uri: String, assetId: String, filename: String, title: String, artist: String, album: String, genre: String, promise: Promise) {
    val extension = when {
      filename.endsWith(".mp3", true) -> ".mp3"
      filename.endsWith(".m4a", true) -> ".m4a"
      else -> { promise.reject("UNSUPPORTED_FORMAT", "Se pueden editar las etiquetas de archivos MP3 y M4A."); return }
    }
    val parsed = Uri.parse(uri)
    if (parsed.scheme != "content" && parsed.scheme != "file") { promise.reject("INVALID_URI", "No se puede editar este archivo."); return }
    // Expo MediaLibrary can return file:// even for a MediaStore item. Its asset
    // ID is the MediaStore row ID; use that URI for the system write grant.
    val target = if (parsed.scheme == "file" && parsed.path?.startsWith("/storage/") == true) {
      if (!assetId.matches(Regex("[0-9]+"))) { promise.reject("MEDIA_ID_REQUIRED", "No se encontró el identificador del archivo para solicitar permiso de escritura."); return }
      ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, assetId.toLong())
    } else parsed
    val edit = EditRequest(target.toString(), extension, cleanTag(title), cleanTag(artist), cleanTag(album), cleanTag(genre), promise)
    if (edit.title.isEmpty()) { promise.reject("TITLE_REQUIRED", "Escribe un título para la canción."); return }
    if (target.scheme == "content" && target.authority?.startsWith("media") == true && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      context.runOnUiQueueThread {
        try {
          check(pendingEdit == null) { "Ya hay una edición pendiente." }
          val activity = context.currentActivity ?: error("Abre WavePlay para confirmar la edición.")
          pendingEdit = edit
          val request = MediaStore.createWriteRequest(context.contentResolver, listOf(target))
          activity.startIntentSenderForResult(request.intentSender, editRequestCode, null, 0, 0, 0)
        } catch (error: Exception) {
          if (pendingEdit === edit) pendingEdit = null
          promise.reject("EDIT_PERMISSION_FAILED", "No se pudo solicitar permiso: ${error.message}", error)
        }
      }
    } else executor.execute { writeAudioTags(edit) }
  }

  private fun cleanTag(value: String): String = value.replace("\uFEFF", "")
    .trim { it.isWhitespace() || it == '\u200B' || it == '\u200C' || it == '\u200D' || it == '\u2060' }

  private fun copyToUri(source: File, uri: Uri) {
    if (uri.scheme == "file") {
      val target = File(requireNotNull(uri.path))
      source.inputStream().use { input -> target.outputStream().use { output -> input.copyTo(output) } }
    } else {
      val output = context.contentResolver.openOutputStream(uri, "wt") ?: error("No se pudo abrir el archivo para escribir.")
      source.inputStream().use { input -> output.use { input.copyTo(it) } }
    }
  }

  private fun writeAudioTags(edit: EditRequest) {
    val uri = Uri.parse(edit.uri)
    val original = File.createTempFile("waveplay-original-", edit.extension, context.filesDir)
    val modified = File.createTempFile("waveplay-edited-", edit.extension, context.cacheDir)
    var writingStarted = false
    var keepBackup = false
    try {
      val input = if (uri.scheme == "file") File(requireNotNull(uri.path)).inputStream() else context.contentResolver.openInputStream(uri) ?: error("No se pudo leer el archivo.")
      input.use { source -> original.outputStream().use { source.copyTo(it) } }
      require(original.length() > 0) { "El archivo está vacío." }
      original.copyTo(modified, overwrite = true)
      val audio = AudioFileIO.read(modified)
      val tag = audio.tagOrCreateAndSetDefault
      tag.setField(FieldKey.TITLE, edit.title)
      tag.setField(FieldKey.ARTIST, edit.artist.ifEmpty { "Artista desconocido" })
      tag.setField(FieldKey.ALBUM, edit.album.ifEmpty { "Álbum desconocido" })
      if (edit.genre.isNotEmpty()) tag.setField(FieldKey.GENRE, edit.genre) else tag.deleteField(FieldKey.GENRE)
      audio.commit()
      val verified = AudioFileIO.read(modified).tag
      require(verified?.getFirst(FieldKey.TITLE) == edit.title) { "No se pudieron comprobar las nuevas etiquetas." }
      writingStarted = true
      copyToUri(modified, uri)
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(context, uri)
        require(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE) == edit.title) { "El archivo no conservó el nuevo título." }
      } finally { retriever.release() }
      context.contentResolver.notifyChange(uri, null)
      edit.promise.resolve(true)
    } catch (error: Exception) {
      if (writingStarted && original.length() > 0) {
        try { copyToUri(original, uri) } catch (_: Exception) { keepBackup = true }
      }
      val recovery = if (keepBackup) " Se conservó una copia interna de seguridad: ${original.absolutePath}" else ""
      edit.promise.reject("EDIT_TAGS_FAILED", "No se pudieron guardar las etiquetas: ${error.message}.$recovery", error)
    } finally {
      if (!keepBackup) original.delete()
      modified.delete()
    }
  }

  @ReactMethod fun readMetadata(uri: String, promise: Promise) = executor.execute {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(context, Uri.parse(uri))
      val picture = retriever.embeddedPicture
      val artwork = picture?.let { bytes ->
        val artworkDir = File(context.filesDir, "waveplay-artwork").apply { mkdirs() }
        val artworkFile = File(artworkDir, "${Integer.toHexString(uri.hashCode())}.jpg")
        if (!artworkFile.exists()) {
          val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
          var sample = 1
          while (bounds.outWidth / sample > 512 || bounds.outHeight / sample > 512) sample *= 2
          val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
          requireNotNull(bitmap) { "No se pudo decodificar la portada" }
          FileOutputStream(artworkFile).use { bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 84, it) }
          bitmap.recycle()
        }
        FileProvider.getUriForFile(context, "${context.packageName}.waveplay.files", artworkFile).toString()
      }
      var relativePath: String? = null
      var fileSize = 0L
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        context.contentResolver.query(Uri.parse(uri), arrayOf(MediaStore.MediaColumns.RELATIVE_PATH, MediaStore.MediaColumns.SIZE), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) {
            relativePath = cursor.getString(0)
            fileSize = cursor.getLong(1)
          }
        }
      }
      promise.resolve(Arguments.createMap().apply {
        putDouble("duration", (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0) / 1000.0)
        putString("title", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE))
        putString("artist", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST))
        putString("album", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM))
        putString("genre", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_GENRE))
        putString("mimeType", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE))
        putDouble("bitrate", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toDoubleOrNull() ?: 0.0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) putDouble("sampleRate", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_SAMPLERATE)?.toDoubleOrNull() ?: 0.0)
        putDouble("fileSize", fileSize.toDouble())
        putString("folder", relativePath)
        putString("artwork", artwork)
      })
    } catch (e: Exception) { promise.resolve(null) } finally { retriever.release() }
  }

  private fun emit(jobId: String, progress: Double, state: String) {
    val safeProgress = if (progress.isFinite()) progress.coerceIn(0.0, 100.0) else 0.0
    val signature = "$state:${safeProgress.toInt() / 5}"
    if (notificationStates.put(jobId, signature) != signature) DownloadNotifications.update(context, jobId, downloadTitles[jobId] ?: "Descarga de música", state, safeProgress)
    // React may be replaced during a reload. Native work and its checkpoint
    // must remain valid even when no JS runtime can receive progress.
    if (context.hasActiveReactInstance()) try {
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("WavePlayDownloadProgress", Arguments.createMap().apply { putString("jobId", jobId); putDouble("progress", safeProgress); putString("state", state) })
    } catch (_: Exception) { }
  }
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}
