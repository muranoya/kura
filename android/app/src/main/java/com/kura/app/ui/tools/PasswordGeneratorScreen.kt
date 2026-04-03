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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import com.kura.app.ui.components.PasswordGeneratorPanel
import com.kura.app.viewmodel.AppViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PasswordGeneratorScreen(appViewModel: AppViewModel, onBack: () -> Unit = {}) {
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("パスワード生成") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                    }
                }
            )
        }
    ) { padding ->
        PasswordGeneratorPanel(
            onGenerate = { length, upper, lower, numbers, symbols ->
                appViewModel.repository.generatePassword(length, upper, lower, numbers, symbols)
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
