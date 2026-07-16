import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")

}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.openllmwiki.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.openllmwiki.app"
        minSdk = 23
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {

            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {

                jniLibs.keepDebugSymbols.add("*/aarch64-linux-android/*.so")
                
                jniLibs.keepDebugSymbols.add("*/armv7-linux-androideabi/*.so")
                
                jniLibs.keepDebugSymbols.add("*/x86_64-linux-android/*.so")
                
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
            signingConfig = signingConfigs.findByName("release")
        }
    }
    signingConfigs {
        create("release") {
            val keystoreProps = file("../keystore.properties")
            if (keystoreProps.exists()) {
                val props = Properties().apply {
                    keystoreProps.inputStream().use { load(it) }
                }
                storeFile = file(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            } else {
                // Fallback: try environment variables (CI)
                storeFile = System.getenv("ANDROID_KEYSTORE_PATH")?.let { file(it) }
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "android"
                keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "androiddebugkey"
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: "android"
            }
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../.."
}

dependencies {


    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")