package net.meshpeak.kura

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import net.meshpeak.kura.ui.navigation.KuraApp
import net.meshpeak.kura.ui.theme.KuraTheme
import net.meshpeak.kura.viewmodel.AppViewModel

class MainActivity : AppCompatActivity() {

    private val appViewModel: AppViewModel by viewModels { AppViewModel.Factory }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStop(owner: LifecycleOwner) {
                    appViewModel.onAppBackgrounded()
                }
                override fun onStart(owner: LifecycleOwner) {
                    appViewModel.onAppForegrounded()
                }
            }
        )

        setContent {
            KuraTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    KuraApp(appViewModel)
                }
            }
        }
    }
}
