interface EntryTypeIconProps {
  type: string
  size?: number
}

export default function EntryTypeIcon({ type, size = 24 }: EntryTypeIconProps) {
  const getIcon = () => {
    switch (type) {
      case 'login':
        return '🔑'
      case 'bank':
        return '🏦'
      case 'ssh_key':
        return '🖥️'
      case 'secure_note':
        return '📝'
      case 'credit_card':
        return '💳'
      case 'password':
        return '🔒'
      case 'software_license':
        return '📋'
      default:
        return '📦'
    }
  }

  return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>{getIcon()}</span>
}
