# kura ProGuard rules

# JNI bridge - keep all native methods
-keep class net.meshpeak.kura.bridge.VaultBridge { *; }

# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers @kotlinx.serialization.Serializable class ** {
    *** Companion;
}
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1>$Companion {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep data model classes used with JSON deserialization
-keep class net.meshpeak.kura.data.model.** { *; }
