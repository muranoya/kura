package net.meshpeak.kura

import android.app.Application
import net.meshpeak.kura.data.session.VaultSession

class KuraApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // VaultBridge is loaded lazily when first accessed
        VaultSession.init(this)
    }
}
