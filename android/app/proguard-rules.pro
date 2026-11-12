# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.yausername.youtubedl_android.** { *; }

# jaudiotagger instantiates ID3 frame bodies by their class names at runtime.
# Obfuscating those names makes every MP3 edit fail with "cannot parse data".
-keep class org.jaudiotagger.tag.id3.framebody.** { *; }

# JCodec parses M4A/MP4 boxes through reflected constructors. Keep their
# names and constructors or editing M4A fails with NoSuchMethodException.
-keep class org.jcodec.containers.mp4.boxes.** { *; }

# Commons Compress registers ZIP extra fields through reflection while
# youtubedl-android unpacks its bundled Python runtime. R8 must not turn
# these implementations into non-instantiable classes in release builds.
-keep class * implements org.apache.commons.compress.archivers.zip.ZipExtraField { <init>(); }

# Add any project specific keep options here:
