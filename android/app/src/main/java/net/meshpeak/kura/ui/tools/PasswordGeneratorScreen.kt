package net.meshpeak.kura.ui.tools

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import net.meshpeak.kura.R
import net.meshpeak.kura.ui.components.PasswordGeneratorPanel
import net.meshpeak.kura.util.ClipboardUtil
import net.meshpeak.kura.viewmodel.AppViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PasswordGeneratorScreen(appViewModel: AppViewModel, onOpenDrawer: () -> Unit = {}) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val clipboardClearSeconds by appViewModel.preferences.clipboardClearSecondsFlow
        .collectAsState(initial = 30)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.nav_password_generator)) },
                navigationIcon = {
                    IconButton(onClick = onOpenDrawer) {
                        Icon(Icons.Default.Menu, contentDescription = stringResource(R.string.cd_menu))
                    }
                }
            )
        }
    ) { padding ->
        PasswordGeneratorPanel(
            onGenerate = { length, lower, upper, numbers, sym1, sym2, sym3 ->
                appViewModel.repository.generatePassword(length, lower, upper, numbers, sym1, sym2, sym3)
            },
            onCopy = { password ->
                ClipboardUtil.copyToClipboard(context, "password", password, clipboardClearSeconds, scope)
            },
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
        )
    }
}
