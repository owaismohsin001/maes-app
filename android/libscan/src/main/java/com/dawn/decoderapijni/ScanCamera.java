package com.dawn.decoderapijni;

import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.util.Log;
import android.view.SurfaceHolder;

import java.io.IOException;
import java.util.List;

public class ScanCamera {

    private static final String TAG = ScanCamera.class.getCanonicalName();

    private static ScanCamera mInstance;
    private static Camera mCamera;

    private static final int FRAME_BUFFER_COUNT = 3;

    private SurfaceHolder mSurfaceHolder;
    private SurfaceTexture mSurfaceTexture;
    private int mFrameBufferSize = 0;
    private static volatile int sFrameWidth = 0;
    private static volatile int sFrameHeight = 0;

    /** MaesApp: sees each preview frame (the live picture on the Barcode home screen). */
    public interface FrameListener {
        /** Called on the camera thread; {@code nv21} is reused right after, so copy what you keep. */
        void onFrame(byte[] nv21, int width, int height);
    }

    private static volatile FrameListener sFrameListener;

    public static void setFrameListener(FrameListener listener) {
        sFrameListener = listener;
    }

    public ScanCamera() {
    }

    public static ScanCamera getInstance() {

        Log.d(TAG, "Camera getInstance .... ");
        if (mInstance == null) {
            mInstance = new ScanCamera();
        }
        return mInstance;
    }


    protected int cameraCheckFacing(final int facing) {

        final int cameraCount = Camera.getNumberOfCameras();
        Camera.CameraInfo info = new Camera.CameraInfo();
        Log.d(TAG, "Camera num: " + cameraCount);
        for (int i = 0; i < cameraCount; i++) {
            Camera.getCameraInfo(i, info);
            if (facing == info.facing) {
                return 0;
            }
        }
        return -2;
    }

    public void cameraInit() {
        Log.i(TAG, " cameraInit ++++++++++++++");
    }
    public void cameraOpen(int port, int width, int height) {
        if (mCamera != null) return;

//        if(cameraCheckFacing(port) != 0){
//            Log.i(TAG,"检测摄像头失败 ++++++++++++++");
//            return;
//        }

        Log.i(TAG, "检测摄像头成功 初始化摄像头 ++++++++++++++");

        try {
            mCamera = Camera.open(port);// 打开后置摄像头  openLegacy 指定版本
            Camera.Parameters params = mCamera.getParameters();
            params.setPreviewSize(width, height);// 设置外形尺寸
            mCamera.setParameters(params);
            setBestFocusMode();

            // Frame buffer size ek dafa nikal lo — har frame par getParameters() slow hai
            Camera.Parameters applied = mCamera.getParameters();
            Camera.Size size = applied.getPreviewSize();
            int bitsPerPixel = ImageFormat.getBitsPerPixel(applied.getPreviewFormat());
            if (bitsPerPixel <= 0) bitsPerPixel = 12; // NV21
            mFrameBufferSize = size.width * size.height * bitsPerPixel / 8;
            sFrameWidth = size.width;
            sFrameHeight = size.height;

            mSurfaceTexture = new SurfaceTexture(10);
            mCamera.setPreviewTexture(mSurfaceTexture);
        } catch (IOException | RuntimeException e) {
            e.printStackTrace();
        }
    }

    // Dense QR ke liye saaf tasveer chahiye — jo focus mode device de, wo lagao
    private void setBestFocusMode() {
        try {
            Camera.Parameters params = mCamera.getParameters();
            List<String> modes = params.getSupportedFocusModes();
            if (modes == null) return;
            String[] preferred = {
                    Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE,
                    Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO,
                    Camera.Parameters.FOCUS_MODE_MACRO,
            };
            for (String mode : preferred) {
                if (modes.contains(mode)) {
                    params.setFocusMode(mode);
                    mCamera.setParameters(params);
                    Log.i(TAG, "Focus mode: " + mode);
                    return;
                }
            }
        } catch (RuntimeException e) {
            Log.e(TAG, "setBestFocusMode failed", e);
        }
    }

    // Har frame ke liye naya byte[] banne se GC pause aate the — fixed buffers reuse karo
    private void attachPreviewBuffers() {
        mCamera.setPreviewCallbackWithBuffer(null); // purani buffer queue clear
        if (mFrameBufferSize <= 0) {
            mCamera.setPreviewCallback(new ScanPreviewCallback());
            return;
        }
        mCamera.setPreviewCallbackWithBuffer(new ScanPreviewCallback());
        for (int i = 0; i < FRAME_BUFFER_COUNT; i++) {
            mCamera.addCallbackBuffer(new byte[mFrameBufferSize]);
        }
    }

    public int cameraClose() {
        Log.e("TAG", "cameraClose: "  );
        if (mCamera != null) {
            mCamera.setPreviewCallback(null);
            mCamera.stopPreview();
            mCamera.release();
            mCamera = null;
            Log.e("TAG", "cameraClose: 2"  );
        }
        return 0;
    }

    public void cameraStart() {
        if (mCamera == null)
            return;
        Log.i(TAG, "cameraStart ++++++++++++++");
//        try {
//            mCamera.setPreviewTexture(mSurfaceTexture);
        attachPreviewBuffers();
        mCamera.startPreview();
//        } catch (IOException e) {
//            e.printStackTrace();
//        }

    }

    public void cameraStop() {
        if (mCamera == null)
            return;
        Log.i(TAG, "cameraStop ++++++++++++++");
        mCamera.stopPreview();
    }

    public void cameraSetSurfaceHolder(SurfaceHolder surfaceHolder) {
        mSurfaceHolder = surfaceHolder;
    }

    public class ScanPreviewCallback implements Camera.PreviewCallback {

        @Override
        public void onPreviewFrame(byte[] data, Camera camera) {
            if (data == null) return;
            // Per-frame getParameters() aur log hata diye — yeh har frame slow karte the
            SoftEngine.getInstance().setSoftEngineIOCtrlEx(SoftEngine.JNI_IOCTRL_SET_DECODE_IMG, data.length, data);
            FrameListener listener = sFrameListener;
            if (listener != null && sFrameWidth > 0) {
                try {
                    listener.onFrame(data, sFrameWidth, sFrameHeight);
                } catch (RuntimeException e) {
                    Log.e(TAG, "FrameListener failed", e);
                }
            }
            // Buffer wapas queue mein do taake agla frame isi mein aaye
            if (mFrameBufferSize > 0 && camera != null) {
                camera.addCallbackBuffer(data);
            }
        }
    }

}
