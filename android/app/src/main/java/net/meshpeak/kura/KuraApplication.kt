package net.meshpeak.kura

import android.app.Application

class KuraApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // VaultBridge is loaded lazily when first accessed
    }
}
