package com.dawn.decoderapijni.bean;

public class CodeEnableBean {
    String codeName;    //码制标识
    String fullCodeName;//码制名
    String codeType;    //码制类型
    String attrName;    //"Enable"
    String attrNickName;//"使能"
    String attrType;    //"switch"
    String enableValue;          //Enable值
    String propNote;    //使能值显示名

    public CodeEnableBean(String codeName, String fullCodeName, String codeType, String attrName, String attrNickName, String attrType, String enableValue, String propNote) {
        this.codeName = codeName;
        this.fullCodeName = fullCodeName;
        this.codeType = codeType;
        this.attrName = attrName;
        this.attrNickName = attrNickName;
        this.attrType = attrType;
        this.enableValue = enableValue;
        this.propNote = propNote;
    }

    public String getCodeName() {
        return codeName;
    }

    public void setCodeName(String codeName) {
        this.codeName = codeName;
    }

    public String getFullCodeName() {
        return fullCodeName;
    }

    public void setFullCodeName(String fullCodeName) {
        this.fullCodeName = fullCodeName;
    }

    public String getCodeType() {
        return codeType;
    }

    public void setCodeType(String codeType) {
        this.codeType = codeType;
    }

    public String getAttrName() {
        return attrName;
    }

    public void setAttrName(String attrName) {
        this.attrName = attrName;
    }

    public String getAttrNickName() {
        return attrNickName;
    }

    public void setAttrNickName(String attrNickName) {
        this.attrNickName = attrNickName;
    }

    public String getAttrType() {
        return attrType;
    }

    public void setAttrType(String attrType) {
        this.attrType = attrType;
    }

    public String getEnableValue() {
        return enableValue;
    }

    public void setEnableValue(String enableValue) {
        this.enableValue = enableValue;
    }

    public String getPropNote() {
        return propNote;
    }

    public void setPropNote(String propNote) {
        this.propNote = propNote;
    }
}
