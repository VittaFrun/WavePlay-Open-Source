package com.waveplay.app

import android.util.Base64
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.security.MessageDigest
import java.security.SecureRandom

class GoogleAccountModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "WavePlayGoogleAccount"

  @ReactMethod
  fun signIn(webClientId: String, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "WavePlay necesita una actividad abierta para mostrar el selector de Google.")
      return
    }
    if (webClientId.isBlank()) {
      promise.reject("NO_CLIENT_ID", "Falta configurar el Client ID web de Google.")
      return
    }
    CoroutineScope(Dispatchers.Main).launch {
      try {
        val rawNonce = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val nonce = Base64.encodeToString(rawNonce, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
        val hashedNonce = MessageDigest.getInstance("SHA-256").digest(nonce.toByteArray(Charsets.UTF_8))
          .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        val option = GetSignInWithGoogleOption.Builder(webClientId).setNonce(hashedNonce).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val credential = CredentialManager.create(context).getCredential(activity, request).credential
        if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
          promise.reject("WRONG_CREDENTIAL", "Google no devolvió un ID token válido.")
          return@launch
        }
        val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
        val result = com.facebook.react.bridge.Arguments.createMap().apply {
          putString("token", token)
          putString("nonce", nonce)
        }
        promise.resolve(result)
      } catch (_: GetCredentialCancellationException) {
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("GOOGLE_SIGN_IN", error.message ?: "No se pudo iniciar sesión con Google.", error)
      }
    }
  }

  @ReactMethod
  fun clearCredentialState(promise: Promise) {
    CoroutineScope(Dispatchers.Main).launch {
      try {
        CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest())
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("GOOGLE_SIGN_OUT", error.message ?: "No se pudo limpiar la sesión de Google.", error)
      }
    }
  }
}
