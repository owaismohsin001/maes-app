package com.maesapp.scanner

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import com.dawn.decoderapijni.SoftEngine
import com.hc.libscan.R
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/**
 * The handheld's built-in scanner (CM60 module) through the vendor SDK in `:libscan`.
 *
 * Follows the vendor's own app on the handheld (com.hc.scancm60), which is known to work there:
 * switch off the system scan service once and give it a second to let go of the scanner, then
 * `initSoftEngine(<app dir "nlscan">)` + `Open()`, an 8 s scan timeout and the illumination on;
 * `Close()` when the app leaves the foreground and open again when it comes back.
 *
 * Every SDK call runs on one background thread: the calls block (initialisation probes the
 * hardware) and the SDK isn't meant to be called concurrently. Results arrive on the SDK's own
 * thread.
 */
internal class ScannerEngine(private val context: Context, private val listener: Listener) {

  interface Listener {
    /** [type] is one of NativeMaesScanner's ScanEvent types; [code] is only set for "decoded". */
    fun onScanEvent(type: String, code: String)
  }

  enum class State(val js: String) {
    IDLE("idle"),
    READY("ready"),
    ERROR("error"),
    UNAVAILABLE("unavailable"),
  }

  data class Status(
      val state: State,
      val error: String,
      val scanning: Boolean,
      val sdkVersion: String,
      val scannerVersion: String,
      val decodeVersion: String,
      val helperInstalled: Boolean,
      val cameraCount: Int,
  )

  private val thread = HandlerThread("MaesScanner").apply { start() }
  private val handler = Handler(thread.looper)

  // Engine thread only.
  private var libraryChecked = false
  private var state = State.IDLE
  private var error = ""
  private var initialized = false
  private var opened = false
  private var reopenOnResume = false
  private var sdkVersion = ""
  private var scannerVersion = ""
  private var decodeVersion = ""

  // Also read on the SDK's callback thread.
  @Volatile private var scanning = false
  @Volatile private var scanStartedAt = 0L
  @Volatile private var sounds: SoundPool? = null
  @Volatile private var beepId = 0

  private val callback =
      SoftEngine.ScanningCallback { eventCode, _, data, length ->
        // A cancel is the answer to our own StopDecode(); anything after a stop is stale.
        if (eventCode == SoftEngine.SCN_EVENT_DEC_CANCEL || !scanning) {
          return@ScanningCallback 1
        }
        scanning = false
        val code = if (eventCode == SoftEngine.SCN_EVENT_DEC_SUCC) decodeText(data, length) else ""
        if (code.isNotEmpty()) {
          listener.onScanEvent("decoded", code)
        } else {
          listener.onScanEvent(endReason(eventCode), "")
        }
        1
      }

  fun status(callback: (Status) -> Unit) {
    handler.post {
      libraryLoaded()
      callback(snapshot())
    }
  }

  /** Powers the scanner up (again after an error); [callback] gets the resulting status. */
  fun prepare(callback: (Status) -> Unit) {
    handler.post {
      open()
      callback(snapshot())
    }
  }

  /** One read. Ends with a "decoded" event, or "timeout" etc. when nothing was read. */
  fun startScan() {
    handler.post {
      if (!libraryLoaded()) {
        listener.onScanEvent("unavailable", "")
        return@post
      }
      // A read is already running: like the vendor app, a second press within the guard is ignored.
      if (scanning && SystemClock.elapsedRealtime() - scanStartedAt < SCAN_GUARD_MS) {
        return@post
      }
      if (!open()) {
        listener.onScanEvent("notReady", "")
        return@post
      }
      try {
        val engine = SoftEngine.getInstance()
        if (scanning) {
          scanning = false
          engine.StopDecode()
        }
        scanStartedAt = SystemClock.elapsedRealtime()
        scanning = true
        listener.onScanEvent("started", "")
        var started = engine.StartDecode()
        if (!started) {
          // The vendor app re-opens the module once when a read won't start.
          engine.Close()
          opened = false
          started = open() && engine.StartDecode()
        }
        if (!started) {
          scanning = false
          listener.onScanEvent("notReady", "")
        }
      } catch (t: Throwable) {
        scanning = false
        fail("StartDecode: $t")
        listener.onScanEvent("notReady", "")
      }
    }
  }

  fun stopScan() {
    handler.post { stopRead() }
  }

  /** The app left the foreground: stop and power down, so the scanner is free for others. */
  fun pause() {
    handler.post {
      stopRead()
      if (opened) {
        runCatching { SoftEngine.getInstance().Close() }
        opened = false
        reopenOnResume = true
      }
    }
  }

  fun resume() {
    handler.post {
      if (reopenOnResume) {
        reopenOnResume = false
        open()
      }
    }
  }

  fun release() {
    handler.post {
      stopRead()
      if (initialized) {
        // Deinit() also closes. The SDK keeps calling the last callback set; it ignores
        // everything now that scanning is false.
        runCatching { SoftEngine.getInstance().Deinit() }
        initialized = false
        opened = false
      }
      sounds?.release()
      sounds = null
      thread.quitSafely()
    }
  }

  private fun stopRead() {
    if (!scanning) {
      return
    }
    scanning = false
    runCatching { SoftEngine.getInstance().StopDecode() }
    listener.onScanEvent("stopped", "")
  }

  /**
   * The native decoder is part of the handheld's system image; on any other phone it is missing.
   * Loading it here first means SoftEngine's own loadLibrary (whose catch misses the Error) is
   * never the one to fail.
   */
  private fun libraryLoaded(): Boolean {
    if (!libraryChecked) {
      libraryChecked = true
      try {
        System.loadLibrary(NATIVE_LIBRARY)
      } catch (t: Throwable) {
        state = State.UNAVAILABLE
        error = t.message ?: t.toString()
      }
    }
    return state != State.UNAVAILABLE
  }

  private fun open(): Boolean {
    if (!libraryLoaded()) {
      return false
    }
    if (opened) {
      return true
    }
    disableSystemScanServiceOnce()
    return try {
      val engine = SoftEngine.getInstance()
      val dataDir = context.getDir("nlscan", Context.MODE_PRIVATE).absolutePath
      if (!engine.initSoftEngine(dataDir)) {
        return fail("initSoftEngine failed")
      }
      initialized = true
      if (!engine.Open()) {
        return fail("Open failed")
      }
      engine.setScanningCallback(callback)
      engine.setScanTimeout(SCAN_TIMEOUT_MS)
      engine.setIlluminationEnable(1)
      if (sdkVersion.isEmpty()) {
        sdkVersion = runCatching { engine.SDKVersion() }.getOrNull().orEmpty()
        scannerVersion = runCatching { engine.getScannerVersion() }.getOrNull().orEmpty()
        decodeVersion = runCatching { engine.getDecodeVersion() }.getOrNull().orEmpty()
      }
      loadBeep()
      opened = true
      state = State.READY
      error = ""
      true
    } catch (t: Throwable) {
      fail(t.toString())
    }
  }

  private fun fail(message: String): Boolean {
    Log.w(TAG, message)
    state = State.ERROR
    error = message
    return false
  }

  /**
   * The handheld's own scan service holds the scanner and types reads into the focused field.
   * The vendor app switches it off once per process with this broadcast, then waits for it to
   * release the scanner.
   */
  private fun disableSystemScanServiceOnce() {
    if (scanServiceDisabled || !helperInstalled()) {
      return
    }
    scanServiceDisabled = true
    try {
      context.sendBroadcast(
          Intent(HELPER_ACTION_SET_CONFIG)
              .setClassName(HELPER_PACKAGE, HELPER_CONFIG_RECEIVER)
              .putExtra("key", "helper_open")
              .putExtra("value", "false"))
      SystemClock.sleep(HELPER_RELEASE_MS)
    } catch (t: Throwable) {
      Log.w(TAG, "Could not switch off the system scan service", t)
    }
  }

  @Suppress("DEPRECATION") // getPackageInfo(String, PackageInfoFlags) needs API 33
  private fun helperInstalled(): Boolean =
      try {
        context.packageManager.getPackageInfo(HELPER_PACKAGE, 0)
        true
      } catch (e: PackageManager.NameNotFoundException) {
        false
      }

  @Suppress("DEPRECATION") // the SDK itself drives the legacy Camera API
  private fun snapshot() =
      Status(
          state = state,
          error = error,
          scanning = scanning,
          sdkVersion = sdkVersion,
          scannerVersion = scannerVersion,
          decodeVersion = decodeVersion,
          helperInstalled = helperInstalled(),
          cameraCount = runCatching { android.hardware.Camera.getNumberOfCameras() }.getOrDefault(0),
      )

  private fun loadBeep() {
    if (sounds != null) {
      return
    }
    val attributes =
        AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
    val pool = SoundPool.Builder().setMaxStreams(1).setAudioAttributes(attributes).build()
    beepId = pool.load(context, R.raw.dingdj5, 1)
    sounds = pool
  }

  /**
   * The SDK's beep plus a short vibration. Called from JS once it accepts a code (a repeat read of
   * the same label is ignored there, and must not beep).
   */
  fun feedback() {
    sounds?.play(beepId, 1f, 1f, 1, 0, 1f)
    val vibrator =
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
          context.getSystemService(Vibrator::class.java)
        }) ?: return
    if (!vibrator.hasVibrator()) {
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator.vibrate(VibrationEffect.createOneShot(VIBRATE_MS, VibrationEffect.DEFAULT_AMPLITUDE))
    } else {
      @Suppress("DEPRECATION") vibrator.vibrate(VIBRATE_MS)
    }
  }

  companion object {
    private const val TAG = "MaesScanner"
    private const val NATIVE_LIBRARY = "NlscanHostDecodeJni"
    private const val SCAN_TIMEOUT_MS = 8000
    private const val SCAN_GUARD_MS = 10_000L
    private const val VIBRATE_MS = 60L

    private const val HELPER_PACKAGE = "com.hc.hckeyboardhelper"
    private const val HELPER_CONFIG_RECEIVER =
        "com.hc.hckeyboardhelper.broadcast.ConfigBroadcastReceiver"
    private const val HELPER_ACTION_SET_CONFIG = "com.hc.keyboardhelper.SET_CONFIG"
    private const val HELPER_RELEASE_MS = 1000L

    /** Once per process, like the vendor app: the setting sticks in the service. */
    @Volatile private var scanServiceDisabled = false

    /** Reads are usually ASCII; QR codes may carry UTF-8. Anything else is kept byte for byte. */
    private fun decodeText(data: ByteArray?, length: Int): String {
      if (data == null) {
        return ""
      }
      val bytes = data.copyOf(if (length in 1..data.size) length else data.size)
      val text =
          try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString()
          } catch (e: CharacterCodingException) {
            String(bytes, Charsets.ISO_8859_1)
          }
      return text.trimEnd('\r', '\n', '\u0000')
    }

    private fun endReason(eventCode: Int) =
        when (eventCode) {
          SoftEngine.SCN_EVENT_DEC_TIMEOUT -> "timeout"
          SoftEngine.SCN_EVENT_NO_IMAGE -> "noImage"
          SoftEngine.SCN_EVENT_SCANNER_OVERHEAT -> "overheat"
          else -> "error"
        }
  }
}
