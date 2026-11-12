package com.maesapp.device

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.location.LocationCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.util.Consumer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.maesapp.specs.NativeMaesDeviceSpec
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Who and where this device is, for the app-control check (spec: `src/native/NativeMaesDevice.ts`):
 * ANDROID_ID + model + network type, and the device's position with its age, accuracy and whether
 * a mock-location app made it. Asks for no permission itself (JS does, see `src/control/device.ts`).
 */
class MaesDeviceModule(reactContext: ReactApplicationContext) : NativeMaesDeviceSpec(reactContext) {

  private val main = Handler(Looper.getMainLooper())

  @SuppressLint("HardwareIds") // the device's identity is exactly what the admin approves
  override fun getInfo(promise: Promise) {
    val ctx = reactApplicationContext
    val id =
        try {
          Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        } catch (t: Throwable) {
          ""
        }
    promise.resolve(
        Arguments.createMap().apply {
          putString("deviceId", id)
          putString(
              "model",
              listOf(Build.MANUFACTURER, Build.MODEL)
                  .filter { !it.isNullOrBlank() }
                  .distinct()
                  .joinToString(" "))
          putString("osVersion", Build.VERSION.RELEASE ?: "")
          putString("connection", connection(ctx))
        })
  }

  override fun getLocation(maxAgeMs: Double, timeoutMs: Double, promise: Promise) {
    main.post { locate(maxAgeMs.toLong(), timeoutMs.toLong(), promise) }
  }

  /** Main thread. */
  @SuppressLint("MissingPermission") // checked first
  private fun locate(maxAgeMs: Long, timeoutMs: Long, promise: Promise) {
    val ctx = reactApplicationContext
    if (!hasPermission(ctx)) {
      promise.resolve(status("denied"))
      return
    }
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    if (lm == null) {
      promise.resolve(status("unavailable"))
      return
    }
    if (!LocationManagerCompat.isLocationEnabled(lm)) {
      promise.resolve(status("off"))
      return
    }
    val providers =
        PROVIDERS.filter { p ->
          try {
            lm.allProviders.contains(p) && lm.isProviderEnabled(p)
          } catch (t: Throwable) {
            false
          }
        }
    if (providers.isEmpty()) {
      promise.resolve(status("off"))
      return
    }

    var best: Location? = null
    for (p in providers) {
      val last =
          try {
            lm.getLastKnownLocation(p)
          } catch (t: Throwable) {
            null
          }
      if (last != null && isBetter(last, best)) {
        best = last
      }
    }
    best?.let {
      if (ageMs(it) <= maxAgeMs) {
        promise.resolve(toMap(it))
        return
      }
    }

    // A fresh position: every provider at once, the first answer wins.
    val done = AtomicBoolean(false)
    val cancel = CancellationSignal()
    val fallback = best
    val finish = { loc: Location? ->
      if (done.compareAndSet(false, true)) {
        cancel.cancel()
        promise.resolve(if (loc != null) toMap(loc) else status("none"))
      }
    }
    val executor = ContextCompat.getMainExecutor(ctx)
    var pending = providers.size
    for (p in providers) {
      try {
        LocationManagerCompat.getCurrentLocation(
            lm,
            p,
            cancel,
            executor,
            Consumer { loc ->
              pending -= 1
              if (loc != null) {
                finish(loc)
              } else if (pending == 0) {
                finish(fallback)
              }
            })
      } catch (t: Throwable) {
        Log.w(TAG, "No fresh position from $p", t)
        pending -= 1
      }
    }
    if (pending <= 0) {
      finish(fallback)
      return
    }
    main.postDelayed({ finish(fallback) }, timeoutMs.coerceAtLeast(1000L))
  }

  private fun hasPermission(ctx: Context) =
      ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) ==
          PackageManager.PERMISSION_GRANTED ||
          ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) ==
              PackageManager.PERMISSION_GRANTED

  private fun ageMs(loc: Location): Long =
      ((SystemClock.elapsedRealtimeNanos() - loc.elapsedRealtimeNanos) / 1_000_000L).coerceAtLeast(0L)

  /** Newer wins; within a minute of each other the more precise one. */
  private fun isBetter(loc: Location, current: Location?): Boolean {
    if (current == null) return true
    val newer = ageMs(current) - ageMs(loc)
    if (newer > 60_000L) return true
    if (newer < -60_000L) return false
    val a = if (loc.hasAccuracy()) loc.accuracy else Float.MAX_VALUE
    val b = if (current.hasAccuracy()) current.accuracy else Float.MAX_VALUE
    return a < b
  }

  private fun toMap(loc: Location): WritableMap =
      Arguments.createMap().apply {
        putString("status", "ok")
        putDouble("latitude", loc.latitude)
        putDouble("longitude", loc.longitude)
        putDouble("accuracy", if (loc.hasAccuracy()) loc.accuracy.toDouble() else -1.0)
        putDouble("ageMs", ageMs(loc).toDouble())
        putBoolean("mock", LocationCompat.isMock(loc))
      }

  private fun status(value: String): WritableMap =
      Arguments.createMap().apply {
        putString("status", value)
        putDouble("latitude", 0.0)
        putDouble("longitude", 0.0)
        putDouble("accuracy", -1.0)
        putDouble("ageMs", 0.0)
        putBoolean("mock", false)
      }

  private fun connection(ctx: Context): String =
      try {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
        when {
          caps == null -> "none"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
          else -> "other"
        }
      } catch (t: Throwable) {
        "other"
      }

  companion object {
    const val NAME = NativeMaesDeviceSpec.NAME
    private const val TAG = "MaesDevice"
    private val PROVIDERS =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            listOf(LocationManager.FUSED_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        else listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
  }
}
