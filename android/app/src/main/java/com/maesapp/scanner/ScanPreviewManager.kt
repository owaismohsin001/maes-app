package com.maesapp.scanner

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.MaesScanPreviewManagerDelegate
import com.facebook.react.viewmanagers.MaesScanPreviewManagerInterface

/** `MaesScanPreview` (spec: `src/native/MaesScanPreviewNativeComponent.ts`): [ScanPreviewView]. */
@ReactModule(name = ScanPreviewManager.NAME)
internal class ScanPreviewManager :
    SimpleViewManager<ScanPreviewView>(), MaesScanPreviewManagerInterface<ScanPreviewView> {

  private val delegate = MaesScanPreviewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<ScanPreviewView> = delegate

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = ScanPreviewView(context)

  @ReactProp(name = "imageRotation", defaultInt = 0)
  override fun setImageRotation(view: ScanPreviewView, value: Int) {
    view.imageRotation = value
  }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
      mapOf(ScanPreviewView.EVENT_NAME to mapOf("registrationName" to "onFrameState"))

  companion object {
    const val NAME = "MaesScanPreview"
  }
}
