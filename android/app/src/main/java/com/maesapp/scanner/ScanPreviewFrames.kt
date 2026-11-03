package com.maesapp.scanner

import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.dawn.decoderapijni.ScanCamera
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Hands the scan engine's preview frames ([ScanCamera], while a read runs) to the
 * [ScanPreviewView]s on screen, as small grey pictures: the luma of a frame is what the decoder
 * sees, and enough to show where the scanner points. Listens only while a view is attached, and
 * converts at most one frame per [FRAME_INTERVAL_MS], so reading isn't slowed down.
 */
internal object ScanPreviewFrames : ScanCamera.FrameListener {

  private const val MAX_WIDTH = 320
  private const val FRAME_INTERVAL_MS = 80L
  private const val OPAQUE = 0xFF000000.toInt()

  private val main = Handler(Looper.getMainLooper())
  private val views = CopyOnWriteArraySet<ScanPreviewView>()

  // Camera thread only. Three bitmaps in turn: one being drawn, one waiting, one being filled.
  private val bitmaps = arrayOfNulls<Bitmap>(3)
  private var next = 0
  private var pixels = IntArray(0)
  private var lastFrameAt = 0L

  /** Main thread. */
  fun attach(view: ScanPreviewView) {
    if (views.add(view) && views.size == 1) {
      ScanCamera.setFrameListener(this)
    }
  }

  /** Main thread. */
  fun detach(view: ScanPreviewView) {
    if (views.remove(view) && views.isEmpty()) {
      ScanCamera.setFrameListener(null)
    }
  }

  override fun onFrame(nv21: ByteArray, width: Int, height: Int) {
    val now = SystemClock.elapsedRealtime()
    if (now - lastFrameAt < FRAME_INTERVAL_MS || nv21.size < width * height) {
      return
    }
    lastFrameAt = now
    val step = maxOf(1, (width + MAX_WIDTH - 1) / MAX_WIDTH)
    val w = width / step
    val h = height / step
    if (w == 0 || h == 0) {
      return
    }
    if (pixels.size != w * h) {
      pixels = IntArray(w * h)
    }
    var i = 0
    for (y in 0 until h) {
      var src = y * step * width
      for (x in 0 until w) {
        val luma = nv21[src].toInt() and 0xFF
        pixels[i++] = OPAQUE or (luma shl 16) or (luma shl 8) or luma
        src += step
      }
    }
    var bitmap = bitmaps[next]
    if (bitmap == null || bitmap.width != w || bitmap.height != h) {
      bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
      bitmaps[next] = bitmap
    }
    bitmap.setPixels(pixels, 0, w, 0, 0, w, h)
    next = (next + 1) % bitmaps.size
    main.post { views.forEach { it.showFrame(bitmap) } }
  }
}
