// 定数

export const DEFAULT_SETTINGS = {
  clipboardClearSeconds: 30,
  autolockMinutes: 5,
  autolockOnBackground: true,
  screenshotPreventionEnabled: true,
}

export const ENTRY_TYPES = [
  { value: 'login' as const, label: 'ログイン' },
  { value: 'bank' as const, label: '銀行口座' },
  { value: 'ssh_key' as const, label: 'SSHキー' },
  { value: 'secure_note' as const, label: 'セキュアノート' },
  { value: 'credit_card' as const, label: 'クレジットカード' },
  { value: 'passkey' as const, label: 'PassKey' },
]

export const PASSWORD_STRENGTH = {
  weak: { label: '弱', color: '#dc2626' },
  medium: { label: '中', color: '#ea580c' },
  strong: { label: '強', color: '#16a34a' },
}
