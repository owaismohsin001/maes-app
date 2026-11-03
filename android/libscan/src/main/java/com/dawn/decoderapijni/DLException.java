package com.dawn.decoderapijni;

public class DLException extends Exception {

    private int code;
    private String reasonPhrase;

    public DLException(int code, String reasonPhrase) {
        this.reasonPhrase = reasonPhrase;
        this.code = code;
    }

    public DLException(int code, String reasonPhrase, String message) {
        super(message);
        this.reasonPhrase = reasonPhrase;
        this.code = code;
    }

    public int getCode() {
        return code;
    }

    public void setCode(int code) {
        this.code = code;
    }

    public String getReasonPhrase() {
        return reasonPhrase;
    }

    public void setReasonPhrase(String reasonPhrase) {
        this.reasonPhrase = reasonPhrase;
    }
}
