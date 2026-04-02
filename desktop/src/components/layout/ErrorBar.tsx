import { AlertTriangle, X } from 'lucide-react'
import { useDismissError, useErrors } from '../../contexts/ErrorContext'

export default function ErrorBar() {
  const errors = useErrors()
  const dismissError = useDismissError()

  if (errors.length === 0) return null

  const latest = errors[errors.length - 1]

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-danger text-sm shrink-0">
      <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
      <span className="text-danger flex-1 truncate">{latest.message}</span>
      {errors.length > 1 && (
        <span className="text-danger/70 text-xs shrink-0">+{errors.length - 1}</span>
      )}
      <button
        onClick={() => dismissError(latest.key)}
        className="shrink-0 text-danger/70 hover:text-danger cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
