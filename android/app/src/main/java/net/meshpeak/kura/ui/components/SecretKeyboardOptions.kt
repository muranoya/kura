package net.meshpeak.kura.ui.components

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType

/**
 * マスターパスワードやリカバリーキーなど秘密を入力する欄のキーボード設定。
 * ComposeはPasswordVisualTransformationからIMEのinputTypeを推定しないため、明示しないと
 * 通常テキストとして扱われ、IMEの予測変換や個人辞書に学習されてしまう。
 */
val SecretKeyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false)
