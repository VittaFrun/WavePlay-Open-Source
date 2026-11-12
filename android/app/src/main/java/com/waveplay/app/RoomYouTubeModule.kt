package com.waveplay.app

import android.os.Handler
import android.os.Looper
import android.widget.FrameLayout
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class RoomYouTubeModule(private val react: ReactApplicationContext) : ReactContextBaseJavaModule(react) {
  private val main = Handler(Looper.getMainLooper())
  private var listeners = 0
  private var roomActive = false
  private val pulse = object : Runnable {
    override fun run() {
      if (!roomActive) return
      if (listeners > 0 && react.hasActiveReactInstance()) react.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("WavePlayRoomYouTubeEvent", "{\"type\":\"pulse\",\"id\":\"\",\"revision\":0}")
      main.postDelayed(this, 5000)
    }
  }
  @ReactMethod fun setRoomActive(active: Boolean) {
    main.post { roomActive = active; main.removeCallbacks(pulse); if (active) main.post(pulse) }
  }
  override fun getName() = "WavePlayRoomYouTube"
  init {
    RoomYouTubeEngine.sink = { raw ->
      if (listeners > 0 && react.hasActiveReactInstance()) react.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("WavePlayRoomYouTubeEvent", raw)
    }
  }
  @ReactMethod fun configure(config: String, html: String, promise: Promise) {
    main.post {
      try { RoomYouTubeEngine.configure(react, config, html); promise.resolve(null) }
      catch (_: Exception) { promise.reject("ROOM_PLAYER", "No se pudo preparar el reproductor de la sala.") }
    }
  }
  @ReactMethod fun stop() { main.post { RoomYouTubeEngine.stop() } }
  @ReactMethod fun resumeLocal() { main.post { RoomYouTubeEngine.resumeLocal() } }
  @ReactMethod fun addListener(name: String) { listeners++ }
  @ReactMethod fun removeListeners(count: Int) { listeners = (listeners - count).coerceAtLeast(0) }
  override fun invalidate() {
    roomActive = false; main.removeCallbacks(pulse)
    RoomYouTubeEngine.sink = null
    main.post { RoomYouTubeEngine.stop() }
    super.invalidate()
  }
}

class RoomYouTubeSurfaceManager : SimpleViewManager<FrameLayout>() {
  override fun getName() = "WavePlayRoomYouTubeSurface"
  override fun createViewInstance(context: ThemedReactContext) = object : FrameLayout(context) {
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
      super.onLayout(changed, left, top, right, bottom)
      fitChildren(width, height)
    }
    private fun fitChildren(w: Int, h: Int) {
      if (w <= 0 || h <= 0) return
      for (index in 0 until childCount) getChildAt(index).let { child ->
        child.measure(android.view.View.MeasureSpec.makeMeasureSpec(w, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(h, android.view.View.MeasureSpec.EXACTLY))
        child.layout(0, 0, w, h)
      }
    }
    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
      super.onSizeChanged(w, h, oldw, oldh)
      // The borrowed WebView is not a Fabric child; explicitly fit it to the
      // host when switching between artwork and the centered video surface.
      for (index in 0 until childCount) getChildAt(index).let { child ->
        child.measure(android.view.View.MeasureSpec.makeMeasureSpec(w, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(h, android.view.View.MeasureSpec.EXACTLY))
        child.layout(0, 0, w, h)
      }
    }
  }
  @ReactProp(name = "displayPlayer", defaultBoolean = false)
  fun setDisplayPlayer(view: FrameLayout, display: Boolean) {
    if (display) {
      displayed = view; RoomYouTubeEngine.attach(view)
    } else if (displayed === view) {
      displayed = null; surface?.let { RoomYouTubeEngine.attach(it) }
    }
  }
  @ReactProp(name = "parking", defaultBoolean = false)
  fun setParking(view: FrameLayout, parking: Boolean) {
    if (parking) { surface = view; if (displayed == null) RoomYouTubeEngine.attach(view) }
  }
  override fun onDropViewInstance(view: FrameLayout) {
    val wasDisplayed = displayed === view
    val wasParking = surface === view
    if (wasDisplayed) displayed = null
    if (wasParking) surface = null
    super.onDropViewInstance(view)
    // Finish the current Fabric unmount before borrowing another host. Clear
    // both references first so a dropped view can never receive its child back.
    android.os.Handler(android.os.Looper.getMainLooper()).post {
      if (wasParking && surface == null) RoomYouTubeEngine.stop()
      else if (wasDisplayed) (displayed ?: surface)?.takeUnless { it === view }?.let { RoomYouTubeEngine.attach(it) }
    }
  }
  companion object { var surface: FrameLayout? = null; var displayed: FrameLayout? = null }
}
