package com.maesapp

import android.view.KeyEvent
import android.webkit.CookieManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.maesapp.scanner.MaesScannerModule

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MaesApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * The handheld's scan button goes to the scanner before any view sees it: the focused WebView
   * would otherwise take the key.
   */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean =
      MaesScannerModule.handleKeyEvent(event) || super.dispatchKeyEvent(event)

  /**
   * Writes the WebView's cookies (the Odoo login session) to disk whenever the app leaves the
   * foreground. Android can kill a background app without warning; cookies still only in memory
   * would be lost and the user signed out.
   */
  override fun onPause() {
    super.onPause()
    // getInstance() throws if the system WebView is missing or being updated: skip the flush then.
    runCatching { CookieManager.getInstance().flush() }
  }
}
