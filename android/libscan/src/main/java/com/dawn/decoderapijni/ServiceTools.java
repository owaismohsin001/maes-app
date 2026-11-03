package com.dawn.decoderapijni;

import android.os.Handler;

import android.util.Log;

import com.dawn.decoderapijni.bean.AttrHelpBean;
import com.dawn.decoderapijni.bean.CodeEnableBean;
import com.dawn.decoderapijni.bean.PropValueHelpBean;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class ServiceTools {
    public static final int MSG_INIT_DONE = 0x1614;
    public static final int MSG_INIT_FIRMWARE_UPGRADE = 0x1615;

    private final String TAG = "dLog_tools";
    private static ServiceTools mInstance = new ServiceTools();
    private boolean initStatus = false;
    private final int SCAN_SET_SCAN_UPDATE = 0x02c1;  //DLScan

    private Set<String> codeSet = new HashSet<>();

    private List<CodeEnableBean> listCodeEnable1D = new ArrayList<>();
    private List<CodeEnableBean> listCodeEnable2D = new ArrayList<>();
    private List<CodeEnableBean> listCodeEnableOther = new ArrayList<>();

    private List<AttrHelpBean> listAttrHelpBean = new ArrayList<>();

    private List<PropValueHelpBean> listPropHelpBean = new ArrayList<>();

    private ServiceTools() {
        Log.d(TAG, "new ServiceTools()");
    }

    public static ServiceTools getInstance() {
        return mInstance;
    }
    public boolean getInitStatus() {
        return initStatus;
    }
    public void startInit(final String nlscanDataPath, final boolean autoUpdateFirmwareFlag,  final Handler msgHandler) {
        if (!initStatus) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    Log.d(TAG, "ScanInit_Runnable run");
                    if (SoftEngine.getInstance().initSoftEngine(nlscanDataPath)) {
                        SoftEngine.getInstance().Open();
                        initStatus = true;
                        if (autoUpdateFirmwareFlag && updateFirmwareByPathAndVersion("/sdcard/bin", null, msgHandler)) {
                            SoftEngine.getInstance().Deinit();
                            initStatus = false;
                            if (SoftEngine.getInstance().initSoftEngine(nlscanDataPath)) {
                                SoftEngine.getInstance().Open();
                                initStatus = true;
                            }
                        }
                        getCodeEnableList();
                    }
                    msgHandler.sendEmptyMessage(MSG_INIT_DONE);
                }
            }).start();
        }
    }

    public void deInit() {
        SoftEngine.getInstance().StopDecode();
        SoftEngine.getInstance().Close();
        SoftEngine.getInstance().Deinit();
        initStatus = false;

    }

    public void startScan() {
        SoftEngine.getInstance().StartDecode();
    }

    public void stopScan() {
        SoftEngine.getInstance().StopDecode();
    }

    /**
     *  固件升级
     *  fileName: 固件文件绝对路径
     */
    public boolean updateFirmware(String fwFileAbsPath) {
        FileChannel inChannel = null;

        File fwFile = new File(fwFileAbsPath);
        try {
            inChannel = new FileInputStream(fwFile).getChannel();

            int fwLen = (int) fwFile.length();
            ByteBuffer inBuffer = ByteBuffer.allocate(fwLen);
            if (fwLen != inChannel.read(inBuffer)) {
                return false;
            }
            return SoftEngine.getInstance().setSoftEngineIOCtrlEx(SCAN_SET_SCAN_UPDATE, fwLen, inBuffer.array()) == 0;

        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }finally {
            if (inChannel != null) {
                try {
                    inChannel.close();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }
        return false;
    }

    // 检测版本
    private boolean checkVersion(String binVersion) {
        // 获取 实际版本
        String nowVersion = SoftEngine.getInstance().getScannerVersion();
        if(nowVersion != null) {
            if(nowVersion.indexOf(binVersion) > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     *  固件升级
     *  path: 固件 查找路径
     *  version: 固件 版本
     *  接口说明:
     *      1.固件路径不为空
     *      2.version 不为空时,下载指定的固件.
     *                为空时,path 下只允许存在一个固件
     */
    public boolean updateFirmwareByPathAndVersion(String path, String version,   final Handler msgHandler) {
        File filePath = new File(path);
        if(!filePath.exists() || !filePath.isDirectory()) {
            Log.e(TAG, "File Path is not exists!! " + path);
            return false;
        }

        File[] files = filePath.listFiles();
        if(files.length == 0) {
            Log.e(TAG, "no found .bin, skip update...");
            return false;
        }

        String binName = null;
        String binVersion = null;
        if(version == null) {
            if(files.length != 1) {
                Log.e(TAG, "too many.. bin");
                return false;
            }
            binName = files[0].getAbsolutePath();
            String fileName = files[0].getName();
            int index = fileName.indexOf("_V");
            binVersion = fileName.substring(index+1, index+1+9);

        } else {
            for (File bin : files) {
                if(bin.getName().indexOf(version) > 0) {
                    binName = bin.getAbsolutePath();
                    binVersion = version;
                    break;
                }
            }
        }

        if(binName == null) {
            return false;
        }
        Log.d(TAG, "Firmware name is:" + binName + " version:" + binVersion);

        // 当前版本是指定版本
        if(checkVersion(binVersion)) {
            Log.w(TAG, "no need to update!!");
            return false;
        }

        msgHandler.sendEmptyMessage(MSG_INIT_FIRMWARE_UPGRADE);

        for(int tryNum = 0; tryNum < 3; tryNum++) {
            if(updateFirmware(binName)) {
                if(getInitStatus()) {
                    if(checkVersion(binVersion)) {
                        Log.w(TAG, "update success!!");
                        return true;
                    } else {
                        Log.w(TAG, "update try again..");
                    }
                }
            }
        }


        return false;
    }

    private void getCodeEnableList() {
        listCodeEnable1D.clear();
        listCodeEnable2D.clear();
        listCodeEnableOther.clear();
        codeSet.clear();
        setCodeEnableListCallback();
        SoftEngine.getInstance().getCodeHelpDoc("ALL", "Enable");

        Collections.reverse(listCodeEnable1D);
        Collections.reverse(listCodeEnable2D);
        Collections.reverse(listCodeEnableOther);
    }


    public List<CodeEnableBean> get1DCodeEnableList() {
        return listCodeEnable1D;
    }

    public List<CodeEnableBean> get2DCodeEnableList() {
        return listCodeEnable2D;
    }

    public List<CodeEnableBean> getOtherCodeEnableList() {
        return listCodeEnableOther;
    }

    public List<AttrHelpBean> getAttrHelpsBeans(String codeName) {
        listAttrHelpBean.clear();
        setAttrBeanListCallback();
        SoftEngine.getInstance().getCodeHelpDoc(codeName, "ALL");
        Collections.reverse(listAttrHelpBean);
        return listAttrHelpBean;
    }

    public List<PropValueHelpBean> getPropHelpsBeans(String codeName, String attrName) {
        listPropHelpBean.clear();
        setPropBeanListCallback();
        SoftEngine.getInstance().getCodeHelpDoc(codeName, attrName);
        Collections.reverse(listPropHelpBean);
        return listPropHelpBean;
    }

    //获取所有码制使能回调函数
    private void setCodeEnableListCallback() {
        SoftEngine.getInstance().setInterfaceCodeAttrProp(new SoftEngine.InterfaceCodeAttrProp() {
            @Override
            public void onCodeAttrPropCallback(String codeName, String fullCodeName, String codeType, String attrName, String attrNickName, String attrType, int value, String propNote) {
                if (codeName == null) {
                    return;
                }

                switch (codeType) {
                    case "1D":
                        if (!codeSet.contains(codeName)) {
                            codeSet.add(codeName);
                            listCodeEnable1D.add(new CodeEnableBean(codeName, fullCodeName, codeType, attrName, attrNickName, attrType, value + "", propNote));
                        }
                        break;
                    case "2D":
                        if (!codeSet.contains(codeName)) {
                            codeSet.add(codeName);
                            listCodeEnable2D.add(new CodeEnableBean(codeName, fullCodeName, codeType, attrName, attrNickName, attrType, value + "", propNote));
                        }
                        break;
                    case "POST":
                        if (!codeSet.contains(codeName)) {
                            codeSet.add(codeName);
                            listCodeEnableOther.add(new CodeEnableBean(codeName, fullCodeName, codeType, attrName, attrNickName, attrType, value + "", propNote));
                        }
                        break;
                    default:
                        Log.e(TAG, "codeType: " + codeType);
                        break;
                }
            }
        });
    }

    //获取某个码制的所有设置项回调函数
    private void setAttrBeanListCallback() {
        SoftEngine.getInstance().setInterfaceCodeAttrProp(new SoftEngine.InterfaceCodeAttrProp() {
            @Override
            public void onCodeAttrPropCallback(String codeName, String fullCodeName, String codeType, String attrName, String attrNickName, String attrType, int value, String propNote) {
                listAttrHelpBean.add(new AttrHelpBean(attrName, attrNickName, attrType, value, propNote));
            }
        });
    }

    //获取某个码制的某个多选设置项的选项回调函数
    private void setPropBeanListCallback() {
        SoftEngine.getInstance().setInterfaceCodeAttrProp(new SoftEngine.InterfaceCodeAttrProp() {
            @Override
            public void onCodeAttrPropCallback(String codeName, String fullCodeName, String codeType, String attrName, String attrNickName, String attrType, int value, String propNote) {
                listPropHelpBean.add(new PropValueHelpBean(value, propNote));
            }
        });
    }

    public byte[] getImageLast() {
        return SoftEngine.getInstance().getLastImage();
    }

}
