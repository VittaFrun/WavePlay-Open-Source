package com.waveplay.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class WavePlayPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(WavePlayFileOrganizerModule(context), WavePlayDownloaderModule(context), GoogleAccountModule(context), WavePlayUpdatesModule(context), WavePlayMediaControlsModule(context), RoomYouTubeModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = listOf(RoomYouTubeSurfaceManager())
}
