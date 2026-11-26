// One APK per monitor. The board URL (with screen name and display key) is baked in so the
// stick needs no setup beyond installing it. The key goes in the URL fragment (#key=), which
// is never sent to the server, so it stays out of request logs.
//   gradle assembleFrontDebug assembleBackDebug -PboardBaseUrl=https://<app>.vercel.app -PdisplayKey=<DISPLAY_KEY>
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val boardBaseUrl = (findProperty("boardBaseUrl") as String?)?.trimEnd('/') ?: "http://10.0.2.2:3000"
val displayKey = (findProperty("displayKey") as String?) ?: ""

fun boardUrl(screen: String) =
    "$boardBaseUrl/display?screen=$screen" + if (displayKey.isNotEmpty()) "#key=$displayKey" else ""

android {
    namespace = "com.slowride.pullboard"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.slowride.pullboard"
        minSdk = 25 // Fire OS 6+
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildFeatures { buildConfig = true }

    flavorDimensions += "screen"
    productFlavors {
        create("front") {
            dimension = "screen"
            buildConfigField("String", "BOARD_URL", "\"${boardUrl("front")}\"")
            resValue("string", "app_name", "Pull Board (Front)")
        }
        create("back") {
            dimension = "screen"
            buildConfigField("String", "BOARD_URL", "\"${boardUrl("back")}\"")
            resValue("string", "app_name", "Pull Board (Back)")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
