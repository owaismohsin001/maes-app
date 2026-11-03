package com.dawn.decoderapijni.bean;

import java.io.Serializable;

public class PropValueHelpBean implements Serializable {
    private int value;
    private String cnName;

    public PropValueHelpBean(int value, String cnName) {
        this.value = value;
        this.cnName = cnName;
    }


    public int getValue() {
        return value;
    }

    public void setValue(int value) {
        this.value = value;
    }

    public String getCnName() {
        return cnName;
    }

    public void setCnName(String cnName) {
        this.cnName = cnName;
    }

}
