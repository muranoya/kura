interface RecoveryKeyInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function RecoveryKeyInput({
  value,
  onChange,
  placeholder = 'XXXX-XXXX-...',
}: RecoveryKeyInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')

    // Auto-format with dashes every 4 characters
    const parts = input.split('-').filter((p) => p)
    const formatted = parts.map((part) => {
      return part.replace(/(.{4})/g, '$1-').replace(/-$/, '')
    })
    const result = formatted.join('-')

    onChange(result)
  }

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      style={{ width: '100%', fontFamily: 'monospace' }}
    />
  )
}
