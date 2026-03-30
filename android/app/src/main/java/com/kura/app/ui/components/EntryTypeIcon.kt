package com.kura.app.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

@Composable
fun EntryTypeIcon(entryType: String, modifier: Modifier = Modifier, tint: Color = Color.Unspecified) {
    val icon = when (entryType) {
        "login" -> Icons.Default.Key
        "bank" -> Icons.Default.AccountBalance
        "ssh_key" -> Icons.Default.Terminal
        "secure_note" -> Icons.Default.Description
        "credit_card" -> Icons.Default.CreditCard
        "passkey" -> Icons.Default.Fingerprint
        else -> Icons.Default.Lock
    }
    Icon(imageVector = icon, contentDescription = entryType, modifier = modifier, tint = tint)
}

fun entryTypeDisplayName(type: String): String = when (type) {
    "login" -> "ログイン"
    "bank" -> "銀行口座"
    "ssh_key" -> "SSHキー"
    "secure_note" -> "セキュアノート"
    "credit_card" -> "クレジットカード"
    "passkey" -> "Passkey"
    else -> type
}
