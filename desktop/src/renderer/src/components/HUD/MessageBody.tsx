import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string | null; code: string }
  | { type: 'table'; rows: string[][] }

interface MessageBodyProps {
  content: string
  compact?: boolean
}

interface CodeToken {
  text: string
  kind: 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'property' | 'operator'
}

const BODY_SIZE = 'var(--hud-font-size, 15px)'
const READING_MEASURE = '100%'
const COMPACT_READING_MEASURE = '60ch'
const TECHNICAL_MEASURE = '100%'
const CODE_FONT = '"SF Mono", "Cascadia Code", Consolas, monospace'

const LANGUAGE_ALIASES: Record<string, string> = {
  ts: 'TypeScript',
  typescript: 'TypeScript',
  js: 'JavaScript',
  javascript: 'JavaScript',
  jsx: 'React JSX',
  tsx: 'React TSX',
  json: 'JSON',
  py: 'Python',
  python: 'Python',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  md: 'Markdown',
  yaml: 'YAML',
  yml: 'YAML'
}

export function MessageBody({ content, compact = false }: MessageBodyProps) {
  const blocks = parseMessageBlocks(content)

  return (
    <div
      className="selectable"
      style={{
        color: 'rgba(255,255,255,0.84)',
        fontSize: BODY_SIZE,
        lineHeight: compact ? 1.62 : 1.7,
        letterSpacing: '0.002em',
        width: '100%',
        maxWidth: '100%'
      }}
    >
      {blocks.map((block, index) => (
        <div key={`${block.type}-${index}`} style={{ marginTop: index === 0 ? 0 : compact ? 16 : 24 }}>
          {renderBlock(block, compact)}
        </div>
      ))}
    </div>
  )
}

function renderBlock(block: Block, compact: boolean) {
  switch (block.type) {
    case 'heading': {
      const sizeMap = {
        1: 'calc(var(--hud-font-size, 15px) + 5px)',
        2: 'calc(var(--hud-font-size, 15px) + 2px)',
        3: 'var(--hud-font-size, 15px)'
      } as const

      return (
        <p
          style={{
            fontSize: sizeMap[block.level],
            lineHeight: block.level === 1 ? 1.18 : block.level === 2 ? 1.24 : 1.32,
            fontWeight: block.level === 1 ? 600 : 550,
            color: 'rgba(255,255,255,0.95)',
            letterSpacing: block.level === 1 ? '-0.022em' : '-0.014em',
            maxWidth: compact ? COMPACT_READING_MEASURE : READING_MEASURE
          }}
        >
          {renderInlineContent(block.text)}
        </p>
      )
    }
    case 'paragraph':
      return (
        <p
          style={{
            color: 'rgba(255,255,255,0.86)',
            whiteSpace: 'pre-wrap',
            maxWidth: compact ? COMPACT_READING_MEASURE : READING_MEASURE
          }}
        >
          {renderInlineContent(block.text)}
        </p>
      )
    case 'unordered-list':
      return (
        <ul
          style={{
            paddingLeft: compact ? 18 : 20,
            display: 'grid',
            gap: compact ? 9 : 11,
            color: 'rgba(255,255,255,0.82)',
            maxWidth: compact ? COMPACT_READING_MEASURE : READING_MEASURE
          }}
        >
          {block.items.map(item => (
            <li key={item} style={{ whiteSpace: 'pre-wrap' }}>
              {renderInlineContent(item)}
            </li>
          ))}
        </ul>
      )
    case 'ordered-list':
      return (
        <ol
          style={{
            paddingLeft: compact ? 20 : 22,
            display: 'grid',
            gap: compact ? 9 : 11,
            color: 'rgba(255,255,255,0.82)',
            maxWidth: compact ? COMPACT_READING_MEASURE : READING_MEASURE
          }}
        >
          {block.items.map(item => (
            <li key={item} style={{ whiteSpace: 'pre-wrap' }}>
              {renderInlineContent(item)}
            </li>
          ))}
        </ol>
      )
    case 'quote':
      return (
        <blockquote
          style={{
            padding: compact ? '4px 0 4px 15px' : '4px 0 4px 18px',
            borderLeft: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(255,255,255,0.68)',
            whiteSpace: 'pre-wrap',
            maxWidth: compact ? COMPACT_READING_MEASURE : READING_MEASURE
          }}
        >
          {renderInlineContent(block.text)}
        </blockquote>
      )
    case 'code':
      return <CodeBlock block={block} compact={compact} />
    case 'table':
      return <TableBlock rows={block.rows} compact={compact} />
  }
}

function CodeBlock({ block, compact }: { block: Extract<Block, { type: 'code' }>; compact: boolean }) {
  const [copied, setCopied] = useState(false)
  const detectedLanguage = normalizeLanguageLabel(block.language || inferLanguage(block.code))
  const tokenLines = useMemo(
    () => block.code.split('\n').map(line => tokenizeCodeLine(line, detectedLanguage)),
    [block.code, detectedLanguage]
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(block.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
        width: '100%',
        maxWidth: compact ? '100%' : TECHNICAL_MEASURE
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{
          padding: compact ? '11px 14px 10px' : '12px 18px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.05)'
        }}
      >
        <div className="flex items-center gap-3">
          <span
            style={{
              color: 'rgba(255,255,255,0.78)',
              fontFamily: CODE_FONT,
              fontSize: 11.5,
              lineHeight: 1
            }}
          >
            {'</>'}
          </span>
          <span
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: '0.015em'
            }}
          >
            {detectedLanguage}
          </span>
        </div>

        <button
          onClick={handleCopy}
          className="transition-opacity duration-150 hover:opacity-80"
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: copied ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.72)'
          }}
          aria-label={copied ? 'Código copiado' : 'Copiar código'}
          title={copied ? 'Copiado' : 'Copiar'}
        >
          {copied ? (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4.5 10.25L8 13.75L15.5 6.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="7" y="4" width="9" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 12.75H4.5C3.67157 12.75 3 12.0784 3 11.25V5.5C3 4.67157 3.67157 4 4.5 4H10.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      <pre
        className="scrollbar-none"
        style={{
          margin: 0,
          padding: compact ? '14px 14px 15px' : '16px 18px 18px',
          overflowX: 'auto',
          color: 'rgba(255,255,255,0.92)',
          fontFamily: CODE_FONT,
          fontSize: compact ? '13px' : '13.75px',
          lineHeight: 1.62,
          tabSize: 2
        }}
      >
        <code>
          {tokenLines.map((tokens, lineIndex) => (
            <div key={`line-${lineIndex}`}>
              {tokens.length === 0 ? '\u00A0' : tokens.map((token, tokenIndex) => (
                <span key={`${lineIndex}-${tokenIndex}`} style={{ color: tokenColor(token.kind) }}>
                  {token.text}
                </span>
              ))}
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}

function TableBlock({ rows, compact }: { rows: string[][]; compact: boolean }) {
  const [header, ...body] = rows

  return (
    <div
      className="scrollbar-none"
      style={{
        overflowX: 'auto',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        background: 'rgba(255,255,255,0.028)',
        width: '100%',
        maxWidth: compact ? COMPACT_READING_MEASURE : READING_MEASURE
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: compact ? 320 : 420 }}>
        <thead>
          <tr>
            {header.map(cell => (
              <th key={cell} style={cellStyle(true)}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join('|')}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cellIndex}-${cell}`} style={cellStyle(false, rowIndex === body.length - 1)}>
                  {renderInlineContent(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function cellStyle(isHeader: boolean, isLastRow = false): CSSProperties {
  return {
    padding: '10px 12px',
    lineHeight: isHeader ? 1.32 : 1.58,
    textAlign: 'left',
    fontSize: isHeader ? '12.5px' : BODY_SIZE,
    fontWeight: isHeader ? 600 : 400,
    color: isHeader ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.8)',
    borderBottom: isLastRow ? 'none' : '1px solid rgba(255,255,255,0.06)',
    verticalAlign: 'top'
  }
}

function renderInlineContent(text: string) {
  const normalized = text.replace(/\\n/g, '\n')
  const parts = normalized.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean)

  return parts.map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={index} style={{ fontWeight: 700, color: 'rgba(255,255,255,0.96)' }}>
          {part.slice(2, -2)}
        </strong>
      )
    }

    if (/^`[^`]+`$/.test(part)) {
      return (
        <code
          key={index}
          style={{
            fontFamily: CODE_FONT,
            fontSize: '0.92em',
            padding: '0.08em 0.34em',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.07)',
            color: 'rgba(255,255,255,0.92)'
          }}
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    return part
  })
}

function normalizeLanguageLabel(language: string | null): string {
  if (!language) return 'Code'
  return LANGUAGE_ALIASES[language.toLowerCase()] ?? language
}

function inferLanguage(code: string): string {
  const source = code.trim()
  if (!source) return 'Code'
  if (/^\s*[{[]/.test(source) && /:\s*["{\[]?/.test(source)) return 'JSON'
  if (/\binterface\b|\btype\b|\bconst\b|\blet\b|\bimport\b|\bexport\b/.test(source)) return 'TypeScript'
  if (/\bfunction\b|\bconsole\.log\b|\b=>\b/.test(source)) return 'JavaScript'
  if (/\bdef\b|\bprint\(|\bimport\b.+:/.test(source)) return 'Python'
  if (/^\s*SELECT\b|^\s*INSERT\b|^\s*UPDATE\b|^\s*WITH\b/im.test(source)) return 'SQL'
  if (/^\s*(npm|pnpm|yarn|git|cd|ls|mkdir)\b/m.test(source)) return 'Shell'
  if (/<[a-z][\s\S]*>/i.test(source)) return 'HTML'
  return 'Code'
}

function tokenizeCodeLine(line: string, language: string): CodeToken[] {
  const tokens: CodeToken[] = []
  const pattern =
    /("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`|\/\/.*$|#.*$|\/\*.*?\*\/|\b\d+(\.\d+)?\b|[A-Za-z_][\w-]*(?=\s*:)|[{}()[\],.;:+\-*/%=<>!?|&]+)/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), kind: 'plain' })
    }

    const value = match[0]
    tokens.push({ text: value, kind: classifyToken(value, language) })
    lastIndex = match.index + value.length
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), kind: 'plain' })
  }

  return tokens
}

function classifyToken(value: string, language: string): CodeToken['kind'] {
  if (/^\/\/|^#|^\/\*/.test(value)) return 'comment'
  if (/^["'`]/.test(value)) return 'string'
  if (/^\d/.test(value)) return 'number'
  if (/^[{}()[\],.;:+\-*/%=<>!?|&]+$/.test(value)) return 'operator'
  if (/:$/.test(value) && !KEYWORD_SET.has(value.slice(0, -1).toLowerCase())) return 'property'

  const normalized = value.toLowerCase()
  if (KEYWORD_SET.has(normalized)) return 'keyword'
  if ((language === 'JSON' || language === 'YAML') && /:$/.test(value)) return 'property'

  return 'plain'
}

function tokenColor(kind: CodeToken['kind']): string {
  switch (kind) {
    case 'keyword':
      return '#8ab4ff'
    case 'string':
      return '#d7ba7d'
    case 'number':
      return '#f5a97f'
    case 'comment':
      return 'rgba(255,255,255,0.38)'
    case 'property':
      return '#c6a0f6'
    case 'operator':
      return 'rgba(255,255,255,0.88)'
    default:
      return 'rgba(255,255,255,0.9)'
  }
}

function parseMessageBlocks(content: string): Block[] {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const lines = normalized.split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trimEnd()
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim() || null
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language, code: codeLines.join('\n') })
      continue
    }

    if (looksLikeStandaloneCode(lines, index)) {
      const codeLines: string[] = []
      while (index < lines.length && looksLikeCodeLine(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }
      blocks.push({ type: 'code', language: null, code: codeLines.join('\n') })
      continue
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim()
      })
      index += 1
      continue
    }

    if (isMarkdownTableStart(lines, index)) {
      const rows: string[][] = []
      rows.push(parseTableRow(lines[index]))
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(parseTableRow(lines[index]))
        index += 1
      }
      blocks.push({ type: 'table', rows })
      continue
    }

    if (/^>\s+/.test(trimmed)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s+/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n') })
      continue
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^[-*•]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*•]\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'unordered-list', items })
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'ordered-list', items })
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      const current = lines[index].trimEnd()
      const currentTrimmed = current.trim()
      if (!currentTrimmed) break
      if (
        currentTrimmed.startsWith('```') ||
        looksLikeStandaloneCode(lines, index) ||
        /^(#{1,3})\s+/.test(currentTrimmed) ||
        /^>\s+/.test(currentTrimmed) ||
        /^[-*•]\s+/.test(currentTrimmed) ||
        /^\d+\.\s+/.test(currentTrimmed) ||
        isMarkdownTableStart(lines, index)
      ) {
        break
      }
      paragraphLines.push(currentTrimmed)
      index += 1
    }

    if (paragraphLines.length) {
      blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') })
      continue
    }

    index += 1
  }

  return blocks
}

function looksLikeStandaloneCode(lines: string[], index: number): boolean {
  const current = lines[index]
  const next = lines[index + 1]
  if (!looksLikeCodeLine(current)) return false
  return Boolean(next && looksLikeCodeLine(next))
}

function looksLikeCodeLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^(#{1,3})\s+/.test(trimmed)) return false
  if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) return false
  if (/^[{}[\]();,]+$/.test(trimmed)) return true
  if (/=>|===|!==|:=|::|<\w+|<\/\w+>/.test(trimmed)) return true
  if (/\b(const|let|var|function|return|interface|type|import|export|class|def|SELECT|FROM|WHERE|INSERT|UPDATE)\b/.test(trimmed)) return true
  if (/^\s{2,}\S+/.test(line)) return true
  if (/^[A-Za-z_][\w-]*\s*:\s*.+$/.test(trimmed)) return true
  return false
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) return false
  const current = lines[index]
  const next = lines[index + 1]
  return current.includes('|') && /^[\s|:-]+$/.test(next.trim())
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

const KEYWORD_SET = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break',
  'continue', 'async', 'await', 'try', 'catch', 'finally', 'class', 'extends', 'new', 'import', 'export',
  'from', 'interface', 'type', 'public', 'private', 'protected', 'implements', 'true', 'false', 'null',
  'undefined', 'def', 'lambda', 'raise', 'except', 'with', 'as', 'select', 'from', 'where', 'insert',
  'into', 'update', 'delete', 'join', 'inner', 'left', 'right', 'group', 'order', 'by'
])
