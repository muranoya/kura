import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PSL_URL = 'https://publicsuffix.org/list/public_suffix_list.dat'
const OUTPUT_PATH = resolve(import.meta.dirname, '../../assets/public_suffix_list.dat')

async function main() {
  console.log(`Downloading PSL from ${PSL_URL}...`)
  const response = await fetch(PSL_URL)
  if (!response.ok) {
    throw new Error(`Failed to download PSL: ${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  writeFileSync(OUTPUT_PATH, text, 'utf-8')
  const lineCount = text.split('\n').length
  console.log(`PSL saved to ${OUTPUT_PATH} (${lineCount} lines)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
