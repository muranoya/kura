package net.meshpeak.kura.ui.credential

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Key
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import net.meshpeak.kura.R
import net.meshpeak.kura.data.model.WebAuthnCredentialCandidate

/**
 * vaultがロック中にGetリクエストが開始された場合（Queryフェーズでは
 * AuthenticationActionのみを返しているため、システムの候補選択UIが機能しない）に、
 * アンロック後に複数のPasskey候補が判明したケースへの簡易フォールバックUI
 * （docs/android-passkey.md 3-2に対する拡張、`webauthn-passkey.md`のSelectCredential.tsx
 * と同じ情報設計）。0件/1件は[PasskeyGetActivity]側で事前に自動処理されるため
 * ここには渡らない。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PasskeyGetSelectScreen(
    candidates: List<WebAuthnCredentialCandidate>,
    onSelect: (WebAuthnCredentialCandidate) -> Unit
) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Scaffold(
            topBar = {
                TopAppBar(title = { Text(stringResource(R.string.passkey_get_select_title)) })
            }
        ) { padding ->
            LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                items(candidates) { candidate ->
                    Card(
                        onClick = { onSelect(candidate) },
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 4.dp)
                    ) {
                        ListItem(
                            headlineContent = {
                                Text(candidate.userDisplayName.ifBlank { candidate.userName })
                            },
                            supportingContent = { Text(candidate.entryName) },
                            leadingContent = {
                                Icon(Icons.Default.Key, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            }
                        )
                    }
                }
            }
        }
    }
}
