import { describe, expect, it, vi } from 'vitest'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import {
  loadReviewDeckCandidates,
  saveReviewDeckCandidate,
} from './reviewDeckAdapter'

const digestPath = '/vault/articles/AI协作/digest.md'
const contentPath = '/vault/articles/AI协作/content.md'

const digestMarkdown = `---
type: 文章拆解
article_id: article-ai
title: AI 协作 · 拆解综述
source: "[[articles/AI协作/content]]"
atom_review_notes:
  article-ai-A001:
    - type: mysoul/reading-note
      footnote: 1
      sourceText: 人必须保留最终判断
      note: 这与我的长期判断一致。
      createdAt: 2026-07-16T01:00:00.000Z
---

# AI 协作 · 拆解综述

## 文章摘要

文章讨论如何在人机协作中保留人的最终判断。

## 候选 Atom

* #atom $article-ai-A001 **把最终判断保留在人这一侧**
  [atom_id: "A001"] [atom_type: "观点"] [title: "把最终判断保留在人这一侧"] [claim: "AI 可以生成候选方案，但人必须保留最终判断。"] [import_status: "待定"] [user_score: 0] [evidence_status: "unreviewed"] [resonance: "unrated"] [reuse_intent: []] [favorite: false]
  **核心句**：AI 可以生成候选方案，但人必须保留最终判断。
  **原文证据**：> “人必须保留最终判断。”
  **上下文**：判断标准需要在反复选择中逐步外显。

* #atom $article-ai-A002 **保存判断依据**
  [atom_id: "A002"] [atom_type: "方法"] [title: "保存判断依据"] [claim: "保存为什么选择比只保存答案更重要。"] [import_status: "待定"] [user_score: 0] [evidence_status: "unreviewed"] [resonance: "unrated"] [reuse_intent: []] [favorite: false]
  **核心句**：保存为什么选择比只保存答案更重要。
  **原文证据**：> “答案会变，判断依据更稳定。”
  **上下文**：这让下一次协作可以复用人的取舍。

## 跨文章关系与 Soul 碰撞

- 与 Soul.md 中“工具替人收束流程”相互支持。
- 与旧观点“AI 自动决定即可”冲突。
`

const contentMarkdown = `---
type: 原文
title: AI 协作
---

# AI 协作

第一段说明为什么只保存答案会丢失决策过程。

第二段继续说明候选方案可以由 AI 快速生成。

人必须保留最终判断。

之后还要把选择理由和偏好沉淀下来。

最后把这些判断用于下一次文章、PPT 和项目。
`

describe('reviewDeckAdapter', () => {
  it('loads digest atoms with original article context and existing review notes', async () => {
    const readNote = vi.fn(async (path: string) => {
      if (path === digestPath) return digestMarkdown
      if (path === contentPath) return contentMarkdown
      throw new Error(`unexpected path: ${path}`)
    })

    const candidates = await loadReviewDeckCandidates([
      makeEntry({ path: digestPath, filename: 'digest.md', title: 'AI 协作 · 拆解综述' }),
    ], readNote)

    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toMatchObject({
      id: 'article-ai#A001',
      ref: 'article-ai-A001',
      articleId: 'article-ai',
      articleTitle: 'AI 协作',
      claim: 'AI 可以生成候选方案，但人必须保留最终判断。',
      evidence: '人必须保留最终判断。',
      action: 'inbox',
      rating: '0',
    })
    expect(candidates[0].prev).toContain('第一段')
    expect(candidates[0].prevMore.join('\n')).toContain('第二段')
    expect(candidates[0].next).toContain('之后还要')
    expect(candidates[0].nextMore.join('\n')).toContain('最后把')
    expect(candidates[0].reviewNotes).toEqual([
      expect.objectContaining({
        footnote: 1,
        sourceText: '人必须保留最终判断',
        note: '这与我的长期判断一致。',
      }),
    ])
  })

  it('writes one atom decision and paired reading note back to the digest only', async () => {
    const writeNote = vi.fn(async () => {})
    const updated = await saveReviewDeckCandidate({
      digestPath,
      markdown: digestMarkdown,
      atomRef: 'article-ai-A001',
      review: {
        action: 'inbox',
        rating: '5',
        evidence: 'strong',
        resonance: 'high',
        reuse: ['article', 'ppt'],
      },
      note: {
        sourceText: '人必须保留最终判断',
        note: '这条可以直接用于产品设计原则。',
      },
      now: new Date('2026-07-16T02:00:00.000Z'),
      writeNote,
    })

    expect(writeNote).toHaveBeenCalledOnce()
    expect(writeNote).toHaveBeenCalledWith(digestPath, updated)
    const firstBlock = updated.slice(updated.indexOf('$article-ai-A001'), updated.indexOf('$article-ai-A002'))
    const secondBlock = updated.slice(updated.indexOf('$article-ai-A002'))
    expect(firstBlock).toContain('[import_status: "入库"]')
    expect(firstBlock).toContain('[user_score: 5]')
    expect(firstBlock).toContain('[evidence_status: "strong"]')
    expect(firstBlock).toContain('[reuse_intent: ["article","ppt"]]')
    expect(firstBlock).toContain('[reviewed_at: "2026-07-16T02:00:00.000Z"]')
    expect(secondBlock).toContain('[import_status: "待定"]')
    expect(updated).toContain('atom_review_notes:')
    expect(updated).toContain('这条可以直接用于产品设计原则。')
  })
})
