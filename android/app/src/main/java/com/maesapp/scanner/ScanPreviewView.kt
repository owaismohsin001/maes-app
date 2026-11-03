package com.maesapp.scanner

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event

/**
 * The live picture of the scan engine (frames from [ScanPreviewFrames]), filling the view like
 * `resizeMode="cover"`. Tells JS through `onFrameState` when frames start and stop arriving; the
 * last frame stays on screen while none come.
 */
internal class ScanPreviewView(private val reactContext: ThemedReactContext) : View(reactContext) {

  private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
  private val drawMatrix = Matrix()
  private var frame: Bitmap? = null
  private var live = false

  /** Clockwise, in degrees: 0, 90, 180 or 270. */
  var imageRotation = 0
    set(value) {
      field = ((value / 90) % 4 + 4) % 4 * 90
      invalidate()
    }

  private val stale = Runnable { setLive(false) }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    ScanPreviewFrames.attach(this)
  }

  override fun onDetachedFromWindow() {
    ScanPreviewFrames.detach(this)
    removeCallbacks(stale)
    live = false
    super.onDetachedFromWindow()
  }

  /** Main thread. */
  fun showFrame(bitmap: Bitmap) {
    frame = bitmap
    invalidate()
    removeCallbacks(stale)
    postDelayed(stale, STALE_MS)
    setLive(true)
  }

  override fun onDraw(canvas: Canvas) {
    val bitmap = frame ?: return
    val turned = imageRotation % 180 != 0
    val imageWidth = if (turned) bitmap.height else bitmap.width
    val imageHeight = if (turned) bitmap.width else bitmap.height
    val scale = maxOf(width.toFloat() / imageWidth, height.toFloat() / imageHeight)
    drawMatrix.reset()
    drawMatrix.postTranslate(-bitmap.width / 2f, -bitmap.height / 2f)
    drawMatrix.postRotate(imageRotation.toFloat())
    drawMatrix.postScale(scale, scale)
    drawMatrix.postTranslate(width / 2f, height / 2f)
    canvas.drawBitmap(bitmap, drawMatrix, paint)
  }

  private fun setLive(value: Boolean) {
    if (live == value) {
      return
    }
    live = value
    UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
        ?.dispatchEvent(FrameStateEvent(UIManagerHelper.getSurfaceId(reactContext), id, value))
  }

  private class FrameStateEvent(surfaceId: Int, viewId: Int, private val live: Boolean) :
      Event<FrameStateEvent>(surfaceId, viewId) {
    override fun getEventName() = EVENT_NAME

    override fun getEventData(): WritableMap =
        Arguments.createMap().apply { putBoolean("live", live) }
  }

  companion object {
    const val EVENT_NAME = "topFrameState"

    /** No frame for this long: the scanner isn't reading (between reads there are ~250 ms). */
    private const val STALE_MS = 1500L
  }
}
