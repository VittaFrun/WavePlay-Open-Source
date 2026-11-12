package com.waveplay.app

import android.app.Activity
import android.content.ContentUris
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import com.facebook.react.bridge.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executors

/** MediaStore moves retain IDs. The durable journal bridges a move and SQLite indexing. */
class WavePlayFileOrganizerModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  private val preferences = context.getSharedPreferences("waveplay_organization", 0)
  private val root = File(context.filesDir, "organization-journal")
  private var cachedId: String? = null
  private var cachedPlan: JSONObject? = null
  private var cachedRows = mutableMapOf<String, JSONObject>()
  private val destinationNames = mutableMapOf<String, MutableMap<String, String>>()
  private var consent: Promise? = null
  private val requestCode = 7426
  override fun getName() = "WavePlayFileOrganizer"

  init {
    context.addActivityEventListener(object : BaseActivityEventListener() {
      override fun onActivityResult(activity: Activity, code: Int, result: Int, data: Intent?) {
        if (code != requestCode) return
        val pending = consent; consent = null
        pending?.resolve(result == Activity.RESULT_OK)
      }
    })
  }
  private fun folder(id: String): File {
    require(id.matches(Regex("[a-f0-9-]{36}"))) { "Revisión inválida" }
    return File(root, id)
  }
  private fun readAsset(uri: Uri): JSONObject {
    require(uri.scheme == "content" && uri.authority == "media" && uri.path?.matches(Regex("/[A-Za-z0-9_-]+/audio/media/[0-9]+")) == true) { "Archivo de audio inválido" }
    val columns = arrayOf("_id", "_display_name", "relative_path", "_size", "date_modified", "mime_type", "owner_package_name")
    context.contentResolver.query(uri, columns, null, null, null)?.use { cursor ->
      check(cursor.moveToFirst()) { "El archivo ya no está disponible" }
      check((cursor.getString(5) ?: "").startsWith("audio/")) { "El archivo no es audio" }
      return JSONObject().put("assetId", cursor.getString(0)).put("uri", uri.toString())
        .put("fileName", cursor.getString(1)).put("folder", cursor.getString(2) ?: "")
        .put("size", cursor.getLong(3)).put("modifiedAt", cursor.getLong(4) * 1000)
        .put("owned", cursor.getString(6) == context.packageName)
    }
    error("No se pudo consultar el archivo")
  }
  private fun validateDestination(path: String) {
    require(path.startsWith("Music/") && path.endsWith('/') && path.length <= 230) { "Elige una carpeta dentro de Música" }
    require(path.trimEnd('/').split('/').all { it.isNotBlank() && it != "." && it != ".." && !it.any { c -> c.code < 32 || c in "\\:*?\"<>|" } }) { "Nombre de carpeta inválido" }
  }
  private fun availableName(uri: Uri, path: String, name: String, preview: Boolean = false): String {
    val collection = Uri.withAppendedPath(Uri.parse("content://media/${uri.pathSegments[0]}"), "audio/media")
    val names = if (preview) destinationNames.getOrPut(uri.pathSegments[0] + ":" + path) {
      val entries = mutableMapOf<String, String>()
      context.contentResolver.query(collection, arrayOf("_id", "_display_name"), "relative_path=?", arrayOf(path), null)?.use { c -> while (c.moveToNext()) entries[c.getString(1).lowercase()] = c.getString(0) }
      entries
    } else null
    fun free(candidate: String): Boolean {
      if (names != null) return names[candidate.lowercase()]?.let { it == uri.lastPathSegment } ?: true
      context.contentResolver.query(collection, arrayOf("_id"), "relative_path=? AND _display_name=? COLLATE NOCASE", arrayOf(path, candidate), null)?.use { c ->
        while (c.moveToNext()) if (c.getString(0) != uri.lastPathSegment) return false
      }
      return true
    }
    if (free(name)) { names?.set(name.lowercase(), uri.lastPathSegment!!); return name }
    val dot = name.lastIndexOf('.'); val stem = if (dot > 0) name.substring(0, dot) else name
    val extension = if (dot > 0) name.substring(dot) else ""
    var suffix = 0
    while (true) {
      val candidate = "${stem.take(160)} (${uri.lastPathSegment}${if (suffix == 0) "" else "-$suffix"})$extension"
      if (free(candidate)) { names?.set(candidate.lowercase(), uri.lastPathSegment!!); return candidate }
      suffix++
    }
  }
  private fun append(id: String, result: JSONObject) {
    val file = File(folder(id), "results.jsonl")
    FileOutputStream(file, true).use { output ->
      // A leading newline isolates any truncated final record left by a power loss.
      output.write(("\n" + result.toString() + "\n").toByteArray(Charsets.UTF_8)); output.fd.sync()
    }
    if (cachedId == id) cachedRows[result.getString("assetId")]?.let { row -> result.keys().forEach { key -> row.put(key, result.get(key)) } }
  }
  private fun load(id: String): JSONObject {
    if (cachedId == id && cachedPlan != null) return cachedPlan!!
    val plan = JSONObject(File(folder(id), "plan.json").readText())
    val results = mutableMapOf<String, JSONObject>()
    val file = File(folder(id), "results.jsonl")
    if (file.exists()) file.forEachLine { line ->
      if (line.isNotBlank()) try { val value = JSONObject(line); results[value.getString("assetId")] = value } catch (_: Exception) { }
    }
    val rows = plan.getJSONArray("rows")
    for (i in 0 until rows.length()) results[rows.getJSONObject(i).getString("assetId")]?.let { result ->
      val row = rows.getJSONObject(i); result.keys().forEach { key -> row.put(key, result.get(key)) }
    }
    cachedId = id; cachedPlan = plan; cachedRows = (0 until rows.length()).associate { rows.getJSONObject(it).let { row -> row.getString("assetId") to row } }.toMutableMap()
    return plan
  }
  private fun task(promise: Promise, work: () -> Any?) { worker.execute {
    try { check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) { "Organizar archivos requiere Android 11 o posterior" }; promise.resolve(work()) }
    catch (error: Exception) { promise.reject("ORGANIZE_FAILED", error.message, error) }
  } }
  @ReactMethod fun prepare(raw: String, promise: Promise) = task(promise) {
    check(preferences.getString("active", null) == null) { "Continúa o finaliza la revisión pendiente" }
    val input = JSONObject(raw); val source = input.getJSONArray("rows")
    require(source.length() <= 20000) { "Organiza hasta 20000 archivos por revisión" }
    destinationNames.clear()
    val rows = JSONArray(); val seen = mutableSetOf<String>(); val reserved = mutableSetOf<String>()
    for (i in 0 until source.length()) {
      val item = source.getJSONObject(i); val id = item.getString("assetId")
      if (!seen.add(id)) continue
      try {
        require(id.matches(Regex("[0-9]+"))) { "Identificador inválido" }
        val originalUri = Uri.parse(item.getString("uri"))
        val uri = if (originalUri.authority == "media") originalUri else ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id.toLong())
        val asset = readAsset(uri); check(asset.getString("assetId") == id && asset.getString("fileName") == item.getString("fileName")) { "El archivo cambió; actualiza la biblioteca" }
        val target = item.getString("destination"); validateDestination(target)
        var name = availableName(uri, target, asset.getString("fileName"), true)
        val reservation = uri.pathSegments[0] + ":" + target
        if (!reserved.add((reservation + name).lowercase())) { name = "${id}-${name}"; check(reserved.add((reservation + name).lowercase())) { "Nombre repetido" } }
        rows.put(asset.put("destination", target).put("targetName", name).put("oldFileName", asset.getString("fileName"))
          .put("oldFolder", asset.getString("folder")).put("status", if (target == asset.getString("folder") && name == asset.getString("fileName")) "skipped" else "pending"))
      } catch (error: Exception) { rows.put(JSONObject().put("assetId", id).put("fileName", item.optString("fileName")).put("status", "error").put("error", error.message)) }
    }
    val id = UUID.randomUUID().toString(); val directory = folder(id); check(directory.mkdirs()) { "No se pudo preparar la revisión" }
    val plan = JSONObject().put("id", id).put("mediaVersion", MediaStore.getVersion(context)).put("rows", rows)
    FileOutputStream(File(directory, "plan.json")).use { output -> output.write(plan.toString().toByteArray(Charsets.UTF_8)); output.fd.sync() }
    check(preferences.edit().putString("active", id).commit()) { "No se pudo guardar la revisión" }
    cachedId = null; cachedPlan = null
    load(id).toString()
  }
  @ReactMethod fun getJob(promise: Promise) = task(promise) { preferences.getString("active", null)?.let { load(it).toString() } }
  @ReactMethod fun authorize(id: String, rawIds: String, promise: Promise) {
    worker.execute {
      try {
        check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) { "Requiere Android 11" }
        check(preferences.getString("active", null) == id) { "La revisión cambió" }
        val requested = JSONArray(rawIds); require(requested.length() <= 500) { "Lote demasiado grande" }
        val wanted = (0 until requested.length()).map { requested.getString(it) }.toSet()
        val rows = load(id).getJSONArray("rows"); val uris = mutableListOf<Uri>()
        for (i in 0 until rows.length()) { val row = rows.getJSONObject(i); if (row.getString("assetId") in wanted && row.getString("status") in listOf("pending", "moving") && !row.optBoolean("owned")) uris.add(Uri.parse(row.getString("uri"))) }
        if (uris.isEmpty()) { promise.resolve(true); return@execute }
        context.runOnUiQueueThread {
          try {
            check(consent == null) { "Ya hay una autorización pendiente" }
            val activity = context.currentActivity ?: error("Abre WavePlay para confirmar")
            val request = MediaStore.createWriteRequest(context.contentResolver, uris)
            consent = promise; activity.startIntentSenderForResult(request.intentSender, requestCode, null, 0, 0, 0)
          } catch (error: Exception) { if (consent === promise) consent = null; promise.reject("ORGANIZE_PERMISSION", error.message, error) }
        }
      } catch (error: Exception) { promise.reject("ORGANIZE_PERMISSION", error.message, error) }
    }
  }
  @ReactMethod fun move(id: String, assetId: String, promise: Promise) = task(promise) {
    check(preferences.getString("active", null) == id) { "La revisión cambió" }
    val plan = load(id); check(plan.getString("mediaVersion") == MediaStore.getVersion(context)) { "El índice de Android cambió. Prepara otra revisión" }
    val row = cachedRows[assetId] ?: error("Archivo no incluido en la revisión")
    if (row.getString("status") in listOf("moved", "indexed", "skipped", "error")) return@task row.toString()
    val uri = Uri.parse(row.getString("uri")); val current = readAsset(uri); val destination = row.getString("destination")
    val alreadyMoved = current.getString("folder") == destination && (current.getString("fileName") == row.getString("targetName") || row.getString("status") == "moving")
    check(current.getLong("size") == row.getLong("size")) { "El archivo cambió desde la vista previa" }
    if (!alreadyMoved) {
      check(current.getLong("modifiedAt") == row.getLong("modifiedAt")) { "El archivo se modificó después de la vista previa" }
      check(current.getString("folder") == row.getString("oldFolder") && current.getString("fileName") == row.getString("oldFileName")) { "La ubicación cambió. Prepara otra revisión" }
      // Fail if another app claimed the reserved name; never overwrite an existing song.
      check(availableName(uri, destination, row.getString("targetName")) == row.getString("targetName")) { "Otro archivo ocupó el destino. Prepara otra revisión" }
      append(id, JSONObject().put("assetId", assetId).put("status", "moving"))
      val values = ContentValues().apply { put(MediaStore.Audio.Media.RELATIVE_PATH, destination); put(MediaStore.Audio.Media.DISPLAY_NAME, row.getString("targetName")) }
      check(context.contentResolver.update(uri, values, null, null) == 1) { "No se pudo mover el archivo" }
    }
    val result = readAsset(uri)
    check(result.getString("folder") == destination && result.getLong("size") == row.getLong("size")) { "La ubicación final no pudo verificarse; conserva esta revisión" }
    val record = JSONObject(result.toString()).put("status", "moved").put("oldFileName", row.getString("oldFileName"))
    append(id, record); record.toString()
  }
  @ReactMethod fun acknowledge(id: String, assetId: String, promise: Promise) = task(promise) { load(id); val row = cachedRows[assetId] ?: error("Archivo desconocido"); append(id, JSONObject(row.toString()).put("status", "indexed")); true }
  @ReactMethod fun finish(id: String, promise: Promise) = task(promise) {
    val rows = load(id).getJSONArray("rows")
    check((0 until rows.length()).none { val row = rows.getJSONObject(it)
      row.getString("status") == "moved" || row.getString("status") == "moving" && try { readAsset(Uri.parse(row.getString("uri"))).getString("folder") == row.getString("destination") } catch (_: Exception) { false }
    }) { "Primero recupera los archivos pendientes de indexar" }
    if (preferences.getString("active", null) == id) check(preferences.edit().remove("active").commit())
    // Only our completed journal is removed; original music is never deleted here.
    val completed = folder(id)
    File(completed, "results.jsonl").delete()
    File(completed, "plan.json").delete()
    completed.delete()
    if (cachedId == id) { cachedId = null; cachedPlan = null; cachedRows.clear(); destinationNames.clear() }
    true
  }
}
