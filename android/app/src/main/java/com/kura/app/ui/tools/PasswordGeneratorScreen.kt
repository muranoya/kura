package com.kura.app.ui.tools

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import com.kura.app.ui.components.PasswordGeneratorPanel
import com.kura.app.viewmodel.AppViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PasswordGeneratorScreen(appViewModel: AppViewModel, onOpenDrawer: () -> Unit = {}) {
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("パスワード生成") },
                navigationIcon = {
                    IconButton(onClick = onOpenDrawer) {
                        Icon(Icons.Default.Menu, contentDescription = "メニュー")
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
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("password", password))
            },
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
        )
    }
}
