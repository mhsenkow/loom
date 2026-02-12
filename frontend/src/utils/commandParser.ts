export interface ParsedSlashCommand {
  cmd: string
  args: string[]
}

export function parseSlashCommand(input: string): ParsedSlashCommand {
  const raw = input.startsWith('/') ? input.slice(1) : input
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]

    if (escaping) {
      current += ch
      escaping = false
      continue
    }

    if (ch === '\\') {
      escaping = true
      continue
    }

    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += ch
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  if (tokens.length === 0) {
    return { cmd: '', args: [] }
  }

  const [cmd, ...args] = tokens
  return {
    cmd: cmd.toLowerCase(),
    args,
  }
}
