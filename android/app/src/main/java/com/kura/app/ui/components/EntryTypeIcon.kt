package com.kura.app.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

fun entryTypeColor(entryType: String): Color = when (entryType) {
    "login" -> Color(0xFF7C3AED)
    "bank" -> Color(0xFF2563EB)
    "ssh_key" -> Color(0xFF059669)
    "secure_note" -> Color(0xFFD97706)
    "credit_card" -> Color(0xFFE11D48)
    "password" -> Color(0xFF8B5CF6)
    "software_license" -> Color(0xFF0D9488)
    else -> Color(0xFF64748B)
}

@Composable
fun EntryTypeIcon(entryType: String, modifier: Modifier = Modifier, tint: Color = Color.Unspecified) {
    val icon = when (entryType) {
        "login" -> Icons.Default.Key
        "bank" -> Icons.Default.AccountBalance
        "ssh_key" -> Icons.Default.Terminal
        "secure_note" -> Icons.Default.Description
        "credit_card" -> Icons.Default.CreditCard
        "password" -> Icons.Default.Lock
        "software_license" -> Icons.Default.Key
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
    "password" -> "パスワード"
    "software_license" -> "ソフトウェアライセンス"
    else -> type
}
