package com.waveplay.app

import com.liseth.audiopermitido.BuildConfig
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

/** APKs stay in a private cache; no installer can be opened before verification. */
class WavePlayUpdatesModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  override fun getName() = "WavePlayUpdates"
  private fun version(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
  @Suppress("DEPRECATION")
  private fun signatures(info: PackageInfo): Set<String> = (if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures)
    ?.map { signature -> MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) } }?.toSet() ?: emptySet()
  @Suppress("DEPRECATION")
  private fun installed(): PackageInfo = context.packageManager.getPackageInfo(context.packageName, if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES)

  @ReactMethod fun getInfo(promise: Promise) {
    try {
      val info = installed()
      promise.resolve(Arguments.createMap().apply {
        putString("packageName", context.packageName); putString("versionName", info.versionName)
        putDouble("versionCode", version(info).toDouble()); putInt("sdk", Build.VERSION.SDK_INT)
        putBoolean("development", BuildConfig.DEBUG)
      })
    } catch (e: Exception) { promise.reject("UPDATE_INFO", "No se pudo consultar la versión instalada.", e) }
  }
  @ReactMethod fun canInstall(promise: Promise) { promise.resolve(Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()) }
  @ReactMethod fun openPermission(promise: Promise) {
    try {
      context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("UPDATE_PERMISSION", "Abre los ajustes de Android y permite instalar actualizaciones desde WavePlay.", e) }
  }
  private fun validate(uri: String, sha: String, bytes: Double, code: Double): File {
    require(sha.matches(Regex("[a-fA-F0-9]{64}")) && bytes > 0 && bytes <= 1_073_741_824 && code > 0) { "Los datos de la actualización no son válidos." }
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Archivo de actualización no válido." }
    val directory = File(context.cacheDir, "waveplay-updates").canonicalFile
    val file = File(parsed.path ?: "").canonicalFile
    require(file.parentFile == directory && file.isFile && file.extension == "apk") { "No se encontró el APK descargado." }
    require(file.length() == bytes.toLong()) { "La descarga está incompleta. Vuelve a descargarla." }
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input -> val buffer = ByteArray(65536); while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) } }
    require(digest.digest().joinToString("") { "%02x".format(it) }.equals(sha, true)) { "El archivo descargado no coincide con la actualización publicada." }
    @Suppress("DEPRECATION")
    val archive = context.packageManager.getPackageArchiveInfo(file.path, if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES)
      ?: throw IllegalArgumentException("El APK no es válido.")
    val current = installed()
    require(archive.packageName == context.packageName) { "El APK pertenece a otra aplicación." }
    require(version(archive) == code.toLong() && version(archive) > version(current)) { "La actualización no es más reciente que la versión instalada." }
    val signers = signatures(current)
    require(signers.isNotEmpty() && signatures(archive) == signers) { "La firma del APK no coincide con WavePlay. Tus datos se conservarán." }
    require(archive.applicationInfo?.minSdkVersion?.let { it <= Build.VERSION.SDK_INT } != false) { "Esta versión necesita un Android más reciente." }
    return file
  }
  @ReactMethod fun verify(uri: String, sha: String, bytes: Double, code: Double, promise: Promise) {
    worker.execute { try { validate(uri, sha, bytes, code); promise.resolve(null) } catch (e: Exception) { promise.reject("UPDATE_INVALID", e.message, e) } }
  }
  @ReactMethod fun install(uri: String, sha: String, bytes: Double, code: Double, promise: Promise) {
    worker.execute {
      try {
        val file = validate(uri, sha, bytes, code)
        require(Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()) { "Permite instalar actualizaciones desde WavePlay en los ajustes de Android." }
        val content = FileProvider.getUriForFile(context, "${context.packageName}.waveplay.files", file)
        context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(content, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
        promise.resolve(null)
      } catch (e: Exception) { promise.reject("UPDATE_INSTALL", e.message, e) }
    }
  }
  override fun invalidate() { worker.shutdown(); super.invalidate() }
}
