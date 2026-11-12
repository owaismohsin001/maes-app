package com.maesapp.scanner

import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView

/**
 * Types a scanned code into the Odoo page the way a hardware (keyboard-wedge) scanner does: real
 * Android key events, one per character, then Enter, sent straight to the WebView.
 *
 * Chromium turns them into genuine (trusted) keydown / keypress / input events, so Odoo's own
 * barcode listener (`barcodes/static/src/barcode_service.js`, Odoo 19) takes them like any USB
 * scanner: on Android it focuses its hidden `input.o-barcode-input` on the first key, the
 * characters land in it and Enter hands the code to the Barcode app (or whatever Odoo screen is
 * open). A focused Odoo field (search box, quantity) gets the code typed in, then Enter — the
 * same as with a USB scanner. Nothing in the app covers Odoo: Odoo's own screen shows the result.
 *
 * The events go to the WebView directly, not through the Activity, so they never reach
 * [MaesScannerModule.handleKeyEvent] (no scan-button or learn-key confusion).
 */
internal object KeyTyper {

  /**
   * The key events for [text] followed by Enter, or null when [text] is empty or a character has
   * no key on Android's virtual keyboard (the caller then falls back to the page script).
   */
  fun keyEvents(text: String): List<KeyEvent>? {
    if (text.isEmpty()) {
      return null
    }
    val chars =
        KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD).getEvents(text.toCharArray())
            ?: return null
    val now = SystemClock.uptimeMillis()
    val typed =
        chars.map { event ->
          KeyEvent.changeTimeRepeat(event, now, 0).also { it.source = InputDevice.SOURCE_KEYBOARD }
        }
    val enter =
        listOf(KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP).map { action ->
          KeyEvent(
              now,
              now,
              action,
              KeyEvent.KEYCODE_ENTER,
              0,
              0,
              KeyCharacterMap.VIRTUAL_KEYBOARD,
              0,
              0,
              InputDevice.SOURCE_KEYBOARD)
        }
    return typed + enter
  }

  /** The first WebView on screen under [view] (the app has one: Odoo). */
  fun findWebView(view: View): WebView? {
    if (view is WebView) {
      return if (view.isShown) view else null
    }
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        findWebView(view.getChildAt(i))?.let {
          return it
        }
      }
    }
    return null
  }

  /**
   * Main thread. Types [text] + Enter into the WebView under [root]. False when there is no
   * WebView on screen or the text can't be typed as keys — nothing was sent then.
   */
  fun typeInto(root: View, text: String): Boolean {
    val webView = findWebView(root) ?: return false
    val events = keyEvents(text) ?: return false
    if (!webView.hasFocus()) {
      webView.requestFocus()
    }
    events.forEach { webView.dispatchKeyEvent(it) }
    return true
  }
}
