import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { VaultEntry } from '../../types'

type UnknownRecord = Record<string, unknown>

export interface ReviewDeckReadingNote {
  type: 'mysoul/reading-note'
  footnote: number
  sourceText: string
  note: string
  createdAt: string
}

export interface ReviewDeckCandidate {
  id: string
  ref: string
  articleId: string
  articleTitle: string
  articleSummary: string
  source: string
  sourceTarget: string
  type: string
  topic: string
  topicTarget: string
  digest: string
  original: string
  prev: string
  prevMore: string[]
  claim: string
  next: string
  nextMore: string[]
  evidence: string
  relation: string
  conflict: string
  action: 'inbox' | 'later' | 'skip'
  rating: string
  evidenceStatus: 'strong' | 'weak' | 'missing' | 'unreviewed'
  resonance: 'high' | 'medium' | 'low' | 'unrated'
  reuse: string[]
  favorite: boolean
  reviewNotes: ReviewDeckReadingNote[]
  reviewedAt: string
}

export interface ReviewDeckReviewInput {
  action: 'inbox' | 'later' | 'skip'
  rating: string
  evidence: 'strong' | 'weak' | 'missing' | 'unreviewed'
  resonance: 'high' | 'medium' | 'low' | 'unrated'
  reuse: string[]
  favorite?: boolean
}

interface ParsedMarkdown {
  frontmatter: UnknownRecord
  body: string
}

interface ParsedAtomBlock {
  ref: string
  attributes: UnknownRecord
  block: string
}

interface AttributeSpan {
  key: string
  value: unknown
  start: number
  end: number
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFrontmatter(markdown: string): ParsedMarkdown {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: markdown }
  const parsed = parseYaml(match[1])
  return {
    frontmatter: isRecord(parsed) ? parsed : {},
    body: match[2],
  }
}

function renderFrontmatter(frontmatter: UnknownRecord, body: string): string {
  return `---\n${stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n${body}`
}

function scalar(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(scalar).map((item) => item.trim()).filter(Boolean)
  const raw = scalar(value).trim()
  if (!raw || raw === 'none') return []
  return raw
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(/[,，、]/)
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

function wikilinkTarget(value: unknown): string {
  const match = scalar(value).trim().match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/)
  return match?.[1]?.trim() ?? ''
}

function topicWikilinkTarget(value: unknown): string {
  const targets = Array.isArray(value) ? value.map(wikilinkTarget) : [wikilinkTarget(value)]
  return targets.find((target) => /(^|\/)topics?\//i.test(target)) ?? ''
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[“”]/g, '"')
    .replace(/^["']|["']$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function markdownSection(body: string, heading: RegExp): string {
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex((line) => /^##\s+/.test(line) && heading.test(line))
  if (start < 0) return ''
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index
      break
    }
  }
  return lines.slice(start + 1, end).join('\n').trim()
}

function labeledValue(block: string, labels: RegExp): string {
  const line = block.split(/\r?\n/).find((candidate) => labels.test(candidate))
  if (!line) return ''
  return normalizeMarkdown(line.replace(/^\s*\*\*[^*]+\*\*[：:]\s*/, ''))
}

function attributeSpans(markdown: string): AttributeSpan[] {
  const spans: AttributeSpan[] = []
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] !== '[') continue
    const keyMatch = markdown.slice(index + 1).match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*/)
    if (!keyMatch) continue

    let depth = 1
    let quote = ''
    let escaped = false
    let end = index + 1
    for (; end < markdown.length; end += 1) {
      const char = markdown[end]
      if (quote) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === quote) quote = ''
        continue
      }
      if (char === '"' || char === "'") quote = char
      else if (char === '[') depth += 1
      else if (char === ']') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (depth !== 0) continue

    const key = keyMatch[1]
    const raw = markdown.slice(index + 1 + keyMatch[0].length, end).trim()
    let value: unknown = raw
    try {
      value = parseYaml(raw)
    } catch {
      // Keep malformed legacy attributes visible instead of dropping the atom.
    }
    spans.push({ key, value, start: index, end: end + 1 })
    index = end
  }
  return spans
}

function parseAtomBlocks(body: string): ParsedAtomBlock[] {
  const section = markdownSection(body, /候选\s*Atom|候选原子/i)
  if (!section) return []
  const starts = [...section.matchAll(/^\*\s+#atom\s+\$([^\s]+)\s+\*\*(.+?)\*\*\s*$/gm)]
  return starts.map((match, index) => {
    const start = match.index ?? 0
    const end = starts[index + 1]?.index ?? section.length
    const block = section.slice(start, end).trimEnd()
    const attributes = Object.fromEntries(attributeSpans(block).map((span) => [span.key, span.value]))
    if (!attributes.title) attributes.title = match[2]
    return { ref: match[1], attributes, block }
  })
}

function articleTitle(frontmatter: UnknownRecord, digestPath: string): string {
  const title = scalar(frontmatter.title) || digestPath.split('/').at(-2) || '未命名文章'
  return title.replace(/\s*[·-]\s*拆解综述\s*$/, '').trim()
}

function contentPathFor(digestPath: string): string {
  return digestPath.replace(/\/[^/]+$/, '/content.md')
}

function sourceParagraphs(markdown: string): string[] {
  return parseFrontmatter(markdown).body
    .split(/\r?\n\s*\r?\n/)
    .filter((paragraph) => !paragraph.trimStart().startsWith('#'))
    .map(normalizeMarkdown)
    .filter((paragraph) => paragraph.length > 0)
}

function contextAroundEvidence(markdown: string, evidence: string, fallback: string) {
  const paragraphs = sourceParagraphs(markdown)
  const needle = normalizeMarkdown(evidence).replace(/[，。！？、；：“”"' \t]/g, '')
  const index = paragraphs.findIndex((paragraph) => (
    paragraph.replace(/[，。！？、；：“”"' \t]/g, '').includes(needle)
  ))
  if (index < 0) {
    return {
      prev: fallback,
      prevMore: [],
      next: paragraphs[0] ?? '',
      nextMore: paragraphs.slice(1),
    }
  }
  const before = paragraphs.slice(0, index)
  const after = paragraphs.slice(index + 1)
  return {
    prev: before[0] ?? fallback,
    prevMore: before.slice(1),
    next: after[0] ?? '',
    nextMore: after.slice(1),
  }
}

function reviewNotes(frontmatter: UnknownRecord, ref: string): ReviewDeckReadingNote[] {
  const notesByAtom = isRecord(frontmatter.atom_review_notes) ? frontmatter.atom_review_notes : {}
  const notes = notesByAtom[ref]
  if (!Array.isArray(notes)) return []
  return notes.flatMap((note, index) => {
    if (!isRecord(note)) return []
    const sourceText = scalar(note.sourceText ?? note.source_text).trim()
    const text = scalar(note.note).trim()
    if (!sourceText || !text) return []
    return [{
      type: 'mysoul/reading-note' as const,
      footnote: Number.isInteger(note.footnote) ? Number(note.footnote) : index + 1,
      sourceText,
      note: text,
      createdAt: scalar(note.createdAt ?? note.created_at),
    }]
  })
}

function actionFrom(value: unknown): ReviewDeckCandidate['action'] {
  const raw = scalar(value)
  if (raw.includes('稍后')) return 'later'
  if (raw.includes('跳过')) return 'skip'
  return 'inbox'
}

function evidenceFrom(value: unknown): ReviewDeckCandidate['evidenceStatus'] {
  const raw = scalar(value).toLowerCase()
  if (raw.includes('strong') || raw.includes('强')) return 'strong'
  if (raw.includes('weak') || raw.includes('弱')) return 'weak'
  if (raw.includes('missing') || raw.includes('缺')) return 'missing'
  return 'unreviewed'
}

function resonanceFrom(value: unknown): ReviewDeckCandidate['resonance'] {
  const raw = scalar(value).toLowerCase()
  if (raw.includes('high') || raw.includes('高')) return 'high'
  if (raw.includes('medium') || raw.includes('中')) return 'medium'
  if (raw.includes('low') || raw.includes('低')) return 'low'
  return 'unrated'
}

function topicFrom(frontmatter: UnknownRecord, attributes: UnknownRecord): string {
  const related = stringList(attributes.related_to ?? frontmatter.related_to)
  const first = related[0]?.replace(/^\[\[|\]\]$/g, '').split('/').at(-1)
  return first || stringList(attributes.tags ?? frontmatter.tags)[0] || '学习与思考'
}

function relationText(body: string): { relation: string; conflict: string } {
  const section = normalizeMarkdown(markdownSection(body, /跨文章关系|Soul\s*碰撞|关联/i))
  const lines = section.split(/\r?\n/).map((line) => line.replace(/^[-*]\s+/, '').trim()).filter(Boolean)
  const conflict = lines.filter((line) => /冲突|重复|反例|纠偏/.test(line)).join(' ')
  return {
    relation: lines.filter((line) => !/冲突|重复|反例|纠偏/.test(line)).join(' '),
    conflict,
  }
}

async function candidatesFromDigest(
  entry: VaultEntry,
  readNote: (path: string) => Promise<string>,
): Promise<ReviewDeckCandidate[]> {
  const digest = parseFrontmatter(await readNote(entry.path))
  const originalPath = contentPathFor(entry.path)
  const original = await readNote(originalPath)
  const articleId = scalar(digest.frontmatter.article_id) || entry.path
  const summary = normalizeMarkdown(markdownSection(digest.body, /文章摘要|摘要/))
  const title = articleTitle(digest.frontmatter, entry.path)
  const relations = relationText(digest.body)
  const sourceTarget = wikilinkTarget(digest.frontmatter.source) || originalPath

  return parseAtomBlocks(digest.body).map((atom) => {
    const atomId = scalar(atom.attributes.atom_id) || atom.ref
    const claim = normalizeMarkdown(
      scalar(atom.attributes.claim) || labeledValue(atom.block, /\*\*核心句\*\*|\*\*一句话/),
    )
    const evidence = labeledValue(atom.block, /\*\*原文证据\*\*|\*\*证据\*\*/)
    const context = contextAroundEvidence(original, evidence, summary)
    return {
      id: `${articleId}#${atomId}`,
      ref: atom.ref,
      articleId,
      articleTitle: title,
      articleSummary: summary,
      source: scalar(digest.frontmatter.source_title) || title,
      sourceTarget,
      type: scalar(atom.attributes.atom_type) || '观点',
      topic: topicFrom(digest.frontmatter, atom.attributes),
      topicTarget: topicWikilinkTarget(atom.attributes.related_to)
        || topicWikilinkTarget(digest.frontmatter.related_to),
      digest: entry.path,
      original: originalPath,
      ...context,
      claim,
      evidence,
      relation: relations.relation,
      conflict: relations.conflict,
      action: actionFrom(atom.attributes.import_status),
      rating: scalar(atom.attributes.user_score) || '0',
      evidenceStatus: evidenceFrom(atom.attributes.evidence_status),
      resonance: resonanceFrom(atom.attributes.resonance),
      reuse: stringList(atom.attributes.reuse_intent),
      favorite: atom.attributes.favorite === true,
      reviewNotes: reviewNotes(digest.frontmatter, atom.ref),
      reviewedAt: scalar(atom.attributes.reviewed_at),
    }
  })
}

export async function loadReviewDeckCandidates(
  digestEntries: VaultEntry[],
  readNote: (path: string) => Promise<string>,
): Promise<ReviewDeckCandidate[]> {
  const articles = await Promise.all(
    digestEntries
      .filter((entry) => entry.filename === 'digest.md' || entry.title.includes('拆解'))
      .map((entry) => candidatesFromDigest(entry, readNote)),
  )
  const candidates = articles.flat()
  const ids = new Set<string>()
  const refs = new Set<string>()
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) throw new Error(`duplicate review atom id: ${candidate.id}`)
    if (refs.has(candidate.ref)) throw new Error(`duplicate review atom ref: ${candidate.ref}`)
    ids.add(candidate.id)
    refs.add(candidate.ref)
  }
  return candidates
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function atomBlockRange(markdown: string, ref: string): { start: number; end: number } {
  const startPattern = new RegExp(`^\\*\\s+#atom\\s+\\$${escapeRegExp(ref)}(?:\\s|$)`, 'm')
  const start = markdown.search(startPattern)
  if (start < 0) throw new Error(`review atom does not exist: ${ref}`)
  const tail = markdown.slice(start + 1)
  const boundaries = [tail.search(/^\*\s+#atom\s+\$/m), tail.search(/^##\s+/m)]
    .filter((value) => value >= 0)
  return { start, end: boundaries.length ? start + 1 + Math.min(...boundaries) : markdown.length }
}

function encodeAttribute(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string' || Array.isArray(value)) return JSON.stringify(value)
  throw new Error('unsupported review atom attribute')
}

function updateAtomAttribute(markdown: string, ref: string, key: string, value: unknown): string {
  const range = atomBlockRange(markdown, ref)
  const block = markdown.slice(range.start, range.end)
  const span = attributeSpans(block).find((candidate) => candidate.key === key)
  const encoded = `[${key}: ${encodeAttribute(value)}]`
  let updatedBlock: string
  if (span) {
    updatedBlock = `${block.slice(0, span.start)}${encoded}${block.slice(span.end)}`
  } else {
    const attributeLine = block.match(/^\s+\[[^\n]+\]$/m)
    if (!attributeLine || attributeLine.index === undefined) {
      throw new Error(`review atom block has no attribute line: ${ref}`)
    }
    const insertAt = attributeLine.index + attributeLine[0].length
    updatedBlock = `${block.slice(0, insertAt)} ${encoded}${block.slice(insertAt)}`
  }
  return `${markdown.slice(0, range.start)}${updatedBlock}${markdown.slice(range.end)}`
}

function importStatus(action: ReviewDeckReviewInput['action']): '入库' | '稍后' | '跳过' {
  if (action === 'later') return '稍后'
  if (action === 'skip') return '跳过'
  return '入库'
}

function statusFor(action: ReviewDeckReviewInput['action']): 'kept' | 'review' | 'discarded' {
  if (action === 'skip') return 'discarded'
  if (action === 'later') return 'review'
  return 'kept'
}

export async function saveReviewDeckCandidate({
  digestPath,
  markdown,
  atomRef,
  review,
  note,
  now = new Date(),
  writeNote,
}: {
  digestPath: string
  markdown: string
  atomRef: string
  review?: ReviewDeckReviewInput
  note?: { sourceText: string; note: string }
  now?: Date
  writeNote: (path: string, content: string) => Promise<void>
}): Promise<string> {
  const parsed = parseFrontmatter(markdown)
  let body = parsed.body
  if (review) {
    const attributes: Record<string, unknown> = {
      import_status: importStatus(review.action),
      status: statusFor(review.action),
      user_score: Number(review.rating) || 0,
      evidence_status: review.evidence,
      resonance: review.resonance,
      reuse_intent: review.reuse,
      favorite: review.favorite ?? false,
      reviewed_at: now.toISOString(),
    }
    for (const [key, value] of Object.entries(attributes)) {
      body = updateAtomAttribute(body, atomRef, key, value)
    }
  }

  if (note?.sourceText.trim() && note.note.trim()) {
    const notesByAtom = isRecord(parsed.frontmatter.atom_review_notes)
      ? parsed.frontmatter.atom_review_notes
      : {}
    const existing = reviewNotes(parsed.frontmatter, atomRef)
    parsed.frontmatter.atom_review_notes = {
      ...notesByAtom,
      [atomRef]: [...existing, {
        type: 'mysoul/reading-note',
        footnote: existing.length + 1,
        sourceText: note.sourceText.trim(),
        note: note.note.trim(),
        createdAt: now.toISOString(),
      }],
    }
    body = updateAtomAttribute(body, atomRef, 'reviewed_at', now.toISOString())
  }

  const updated = renderFrontmatter(parsed.frontmatter, body)
  await writeNote(digestPath, updated)
  return updated
}
