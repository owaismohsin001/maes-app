package com.dawn.decoderapijni.bean;

import java.io.Serializable;
import java.util.List;

public class AttrHelpBean implements Serializable {

    private String name;
    private String cnName;
    private String type;
    private int saveValue = 0;
    private String valueText;

    public AttrHelpBean(String name, String cnName, String type, int saveValue, String valueText) {
        this.name = name;
        this.cnName = cnName;
        this.type = type;
        this.saveValue = saveValue;
        this.valueText = valueText;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCnName() {
        return cnName;
    }

    public void setCnName(String cnName) {
        this.cnName = cnName;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public int getSaveValue() {
        return saveValue;
    }

    public void setSaveValue(int saveValue) {
        this.saveValue = saveValue;
    }

    public String getValueText() {
        return valueText;
    }

    public void setValueText(String valueText) {
        this.valueText = valueText;
    }
}
