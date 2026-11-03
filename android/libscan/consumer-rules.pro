# The native decoder calls back into these classes by name (SoftEngine's static callbacks,
# ScanCamera's camera methods, DLException's constructor): never rename or strip them.
-keep class com.dawn.decoderapijni.** { *; }
