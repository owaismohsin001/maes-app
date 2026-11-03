package com.maesapp.scanner

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

/** Registers [MaesScannerModule] and [ScanPreviewManager] (added by hand in MainApplication: it lives in the app). */
class MaesScannerPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == MaesScannerModule.NAME) MaesScannerModule(reactContext) else null

  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<in Nothing, in Nothing>> = listOf(ScanPreviewManager())

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
        MaesScannerModule.NAME to
            ReactModuleInfo(
                name = MaesScannerModule.NAME,
                className = MaesScannerModule.NAME,
                canOverrideExistingModule = false,
                needsEagerInit = false,
                isCxxModule = false,
                isTurboModule = true,
            ))
  }
}
