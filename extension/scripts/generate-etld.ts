import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PSL_PATH = resolve(import.meta.dirname, '../../assets/public_suffix_list.dat')
const OUTPUT_PATH = resolve(import.meta.dirname, '../src/shared/etld-data.generated.ts')

interface PslData {
  rules: string[]
  wildcards: string[]
  exceptions: string[]
}

function parsePsl(content: string): PslData {
  const rules: string[] = []
  const wildcards: string[] = []
  const exceptions: string[] = []

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    // Skip empty lines and comments
    if (!line || line.startsWith('//')) continue

    if (line.startsWith('!')) {
      // Exception rule: !www.ck → exception for www.ck
      exceptions.push(line.slice(1))
    } else if (line.startsWith('*.')) {
      // Wildcard rule: *.ck → wildcard for ck
      wildcards.push(line.slice(2))
    } else {
      rules.push(line)
    }
  }

  return { rules, wildcards, exceptions }
}

function generateTypeScript(data: PslData): string {
  return `// Auto-generated from assets/public_suffix_list.dat — do not edit manually
// Run: npx tsx scripts/generate-etld.ts

export const PSL_RULES = new Set(${JSON.stringify(data.rules)})

export const PSL_WILDCARDS = new Set(${JSON.stringify(data.wildcards)})

export const PSL_EXCEPTIONS = new Set(${JSON.stringify(data.exceptions)})
`
}

function main() {
  console.log(`Reading PSL from ${PSL_PATH}...`)
  const content = readFileSync(PSL_PATH, 'utf-8')
  const data = parsePsl(content)
  console.log(
    `Parsed: ${data.rules.length} rules, ${data.wildcards.length} wildcards, ${data.exceptions.length} exceptions`,
  )

  const tsCode = generateTypeScript(data)
  writeFileSync(OUTPUT_PATH, tsCode, 'utf-8')
  console.log(`Generated ${OUTPUT_PATH}`)
}

main()
