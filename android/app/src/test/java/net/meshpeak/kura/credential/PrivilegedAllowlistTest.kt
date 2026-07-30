package net.meshpeak.kura.credential

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PrivilegedAllowlistTest {

    @Test
    fun `実際のassets gpm_privileged_allowlist json がロードでき既知ブラウザを含む`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val raw = PrivilegedAllowlist.raw(context)
        assertTrue(raw.contains("com.android.chrome"))
    }
}
