import type { ReactNode } from 'react'

interface MdProps {
  children?: ReactNode
  href?: string
  inline?: boolean
}

export const markdownComponents = {
  h1: ({ children }: MdProps) => (
    <h1 className="text-2xl font-bold text-text-primary mt-4 mb-2">{children}</h1>
  ),
  h2: ({ children }: MdProps) => (
    <h2 className="text-xl font-bold text-text-primary mt-3 mb-2">{children}</h2>
  ),
  h3: ({ children }: MdProps) => (
    <h3 className="text-lg font-bold text-text-primary mt-2 mb-2">{children}</h3>
  ),
  p: ({ children }: MdProps) => (
    <p className="text-text-primary mb-3 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: MdProps) => (
    <ul className="list-disc pl-5 text-text-primary mb-3 space-y-1">{children}</ul>
  ),
  ol: ({ children }: MdProps) => (
    <ol className="list-decimal pl-5 text-text-primary mb-3 space-y-1">{children}</ol>
  ),
  li: ({ children }: MdProps) => <li className="text-text-primary">{children}</li>,
  code: ({ inline, children }: MdProps) =>
    inline ? (
      <code className="bg-bg-elevated px-1.5 py-0.5 rounded text-sm font-mono text-text-primary">
        {children}
      </code>
    ) : (
      <code className="block bg-bg-elevated p-3 rounded text-sm font-mono text-text-primary overflow-x-auto mb-3">
        {children}
      </code>
    ),
  pre: ({ children }: MdProps) => (
    <pre className="bg-bg-elevated p-3 rounded text-sm font-mono text-text-primary overflow-x-auto mb-3">
      {children}
    </pre>
  ),
  blockquote: ({ children }: MdProps) => (
    <blockquote className="border-l-4 border-accent pl-3 py-1 text-text-secondary italic mb-3">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: MdProps) => (
    <a
      href={href}
      className="text-accent hover:text-accent-hover underline break-all"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }: MdProps) => (
    <strong className="font-bold text-text-primary">{children}</strong>
  ),
  em: ({ children }: MdProps) => <em className="italic text-text-primary">{children}</em>,
  hr: () => <hr className="border-border my-4" />,
  table: ({ children }: MdProps) => (
    <table className="border-collapse border border-border w-full mb-3 text-sm">{children}</table>
  ),
  thead: ({ children }: MdProps) => <thead className="bg-bg-elevated">{children}</thead>,
  tbody: ({ children }: MdProps) => <tbody>{children}</tbody>,
  tr: ({ children }: MdProps) => <tr className="border border-border">{children}</tr>,
  th: ({ children }: MdProps) => (
    <th className="border border-border p-2 text-text-primary font-bold text-left">{children}</th>
  ),
  td: ({ children }: MdProps) => (
    <td className="border border-border p-2 text-text-primary">{children}</td>
  ),
}
