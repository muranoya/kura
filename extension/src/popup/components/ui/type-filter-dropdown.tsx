import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

interface TypeFilterDropdownProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

export default function TypeFilterDropdown({
  value,
  onChange,
  options,
}: TypeFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Esc キーで閉じる
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const selectedOption = options.find((o) => o.value === value)

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-sm',
          'border-border bg-bg-surface text-text-primary',
          'focus:outline-none focus:ring-2 focus:ring-accent',
          'hover:bg-bg-elevated transition-colors'
        )}
      >
        <span className="truncate">{selectedOption?.label || value}</span>
        <ChevronDown
          size={16}
          className={cn(
            'flex-shrink-0 opacity-50 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute top-full left-0 right-0 mt-1',
            'rounded-md border border-border bg-bg-surface shadow-lg',
            'z-50'
          )}
        >
          <ul className="max-h-64 overflow-y-auto py-1">
            {options.map((option) => (
              <li key={option.value}>
                <button
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left',
                    'transition-colors',
                    value === option.value
                      ? 'bg-bg-elevated text-text-primary'
                      : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                  )}
                >
                  <Check
                    size={14}
                    className={cn(
                      'flex-shrink-0',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span>{option.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
