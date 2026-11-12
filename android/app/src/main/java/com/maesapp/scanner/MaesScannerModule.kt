package com.maesapp.scanner

import android.content.Context
import android.util.Log
import android.view.KeyEvent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.maesapp.specs.NativeMaesScannerSpec
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicReference

/**
 * JS face of [ScannerEngine] (spec: `src/native/NativeMaesScanner.ts`), plus the hardware scan
 * button: [MainActivity][com.maesapp.MainActivity] hands every key event to [handleKeyEvent].
 */
class MaesScannerModule(reactContext: ReactApplicationContext) :
    NativeMaesScannerSpec(reactContext), LifecycleEventListener, ScannerEngine.Listener {

  private val engine = ScannerEngine(reactContext.applicationContext, this)
  private val prefs = reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  @Volatile private var scanKeyCode = prefs.getInt(PREF_SCAN_KEY_CODE, DEFAULT_SCAN_KEY_CODE)
  private val learnRequest = AtomicReference<Promise?>(null)

  init {
    reactContext.addLifecycleEventListener(this)
    active = WeakReference(this)
  }

  override fun getStatus(promise: Promise) {
    engine.status { promise.resolve(it.toMap()) }
  }

  override fun prepare(promise: Promise) {
    engine.prepare { promise.resolve(it.toMap()) }
  }

  override fun startScan() = engine.startScan()

  override fun stopScan() = engine.stopScan()

  override fun feedback() = engine.feedback()

  /** Types [text] + Enter into the Odoo WebView as real key events (see [KeyTyper]). */
  override fun typeText(text: String, promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null || text.isEmpty()) {
      promise.resolve(false)
      return
    }
    activity.runOnUiThread {
      val typed =
          try {
            KeyTyper.typeInto(activity.window.decorView, text)
          } catch (t: Throwable) {
            Log.w(TAG, "Could not type the code into the WebView", t)
            false
          }
      promise.resolve(typed)
    }
  }

  override fun learnScanKey(promise: Promise) {
    learnRequest.getAndSet(promise)?.reject(E_CANCELLED, "Replaced by a new request")
  }

  override fun cancelLearnScanKey() {
    learnRequest.getAndSet(null)?.reject(E_CANCELLED, "Cancelled")
  }

  override fun onScanEvent(type: String, code: String) {
    emitOnScanEvent(
        Arguments.createMap().apply {
          putString("type", type)
          putString("code", code)
        })
  }

  override fun onHostResume() = engine.resume()

  override fun onHostPause() = engine.pause()

  override fun onHostDestroy() = Unit

  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    if (active?.get() === this) {
      active = null
    }
    learnRequest.getAndSet(null)?.reject(E_CANCELLED, "Scanner closed")
    engine.release()
    super.invalidate()
  }

  /** Main thread. True when the event was consumed: the scan button, or the key being learned. */
  private fun onKeyEvent(event: KeyEvent): Boolean {
    val keyCode = event.keyCode
    if (keyCode in NEVER_SCAN_KEYS) {
      return false
    }
    if (event.action == KeyEvent.ACTION_DOWN) {
      learnRequest.getAndSet(null)?.let { promise ->
        scanKeyCode = keyCode
        prefs.edit().putInt(PREF_SCAN_KEY_CODE, keyCode).apply()
        promise.resolve(keyCode)
        return true
      }
    }
    if (keyCode != scanKeyCode) {
      return false
    }
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
      emitOnScanKey()
    }
    return true
  }

  private fun ScannerEngine.Status.toMap(): WritableMap =
      Arguments.createMap().apply {
        putString("state", state.js)
        putString("error", error)
        putBoolean("scanning", scanning)
        putString("sdkVersion", sdkVersion)
        putString("scannerVersion", scannerVersion)
        putString("decodeVersion", decodeVersion)
        putInt("scanKeyCode", scanKeyCode)
        putBoolean("helperInstalled", helperInstalled)
        putInt("cameraCount", cameraCount)
      }

  companion object {
    const val NAME = NativeMaesScannerSpec.NAME
    private const val TAG = "MaesScanner"

    /** The handheld's side scan button, as the vendor app on the device handles it. */
    private const val DEFAULT_SCAN_KEY_CODE = 290
    private const val PREFS = "maes_scanner"
    private const val PREF_SCAN_KEY_CODE = "scan_key_code"
    private const val E_CANCELLED = "E_CANCELLED"

    /** Keys that must keep their normal meaning, so they can never become the scan button. */
    private val NEVER_SCAN_KEYS =
        setOf(
            KeyEvent.KEYCODE_UNKNOWN,
            KeyEvent.KEYCODE_BACK,
            KeyEvent.KEYCODE_HOME,
            KeyEvent.KEYCODE_POWER,
            KeyEvent.KEYCODE_APP_SWITCH,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_ESCAPE,
        )

    @Volatile private var active: WeakReference<MaesScannerModule>? = null

    /** Called by MainActivity for every key event, before any view sees it. True = consumed. */
    @JvmStatic
    fun handleKeyEvent(event: KeyEvent): Boolean = active?.get()?.onKeyEvent(event) ?: false
  }
}
