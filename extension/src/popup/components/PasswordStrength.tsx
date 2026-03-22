interface PasswordStrengthProps {
  password: string
}

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const calculateStrength = (pwd: string) => {
    if (!pwd) return 0
    let strength = 0
    if (pwd.length >= 8) strength++
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++
    if (/[0-9]/.test(pwd)) strength++
    if (/[!@#$%^&*]/.test(pwd)) strength++
    return strength
  }

  const strength = calculateStrength(password)
  const strengthLabels = ['', '弱', '中弱', '中', '強']
  const strengthColors = ['', '#dc2626', '#ea580c', '#f59e0b', '#16a34a']

  if (!password) return null

  return (
    <div
      style={{
        marginTop: '0.5rem',
        padding: '0.5rem',
        backgroundColor: strengthColors[strength],
        color: 'white',
        borderRadius: '0.375rem',
        fontSize: '0.875rem',
        textAlign: 'center',
      }}
    >
      強度: {strengthLabels[strength]}
    </div>
  )
}
