package com.waveplay.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class WavePlayMediaControlsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var listeners = 0
  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(receiverContext: Context?, intent: Intent?) {
      val action = intent?.getStringExtra(EXTRA_ACTION) ?: return
      if (listeners > 0 && context.hasActiveReactInstance()) {
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT, action)
      }
    }
  }

  init {
    val filter = IntentFilter(BROADCAST_ACTION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      context.registerReceiver(receiver, filter)
    }
  }

  override fun getName() = "WavePlayMediaControls"

  @ReactMethod
  fun setFavorite(favorite: Boolean) {
    val intent = Intent().setClassName(context, AUDIO_SERVICE)
      .setAction(ACTION_SET_FAVORITE)
      .putExtra(EXTRA_FAVORITE, favorite)
    try { context.startService(intent) } catch (_: Exception) { /* The player may not be active yet. */ }
  }

  @ReactMethod fun addListener(eventName: String) { if (eventName == EVENT) listeners += 1 }
  @ReactMethod fun removeListeners(count: Int) { listeners = (listeners - count).coerceAtLeast(0) }

  override fun invalidate() {
    try { context.unregisterReceiver(receiver) } catch (_: IllegalArgumentException) { }
    super.invalidate()
  }

  companion object {
    private const val EVENT = "WavePlayMediaAction"
    private const val BROADCAST_ACTION = "com.waveplay.app.MEDIA_ACTION"
    private const val EXTRA_ACTION = "action"
    private const val EXTRA_FAVORITE = "favorite"
    private const val ACTION_SET_FAVORITE = "com.waveplay.app.action.SET_FAVORITE"
    private const val AUDIO_SERVICE = "expo.modules.audio.service.AudioControlsService"
  }
}
