import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectionPresentationProviderProps } from '../../collections/collectionPresentationHost'
import type { CollectionDefinition } from '../../collections/collectionTypes'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import {
  loadReviewDeckCandidates,
  saveReviewDeckCandidate,
  type ReviewDeckCandidate,
} from './reviewDeckAdapter'
import { ReviewDeckPresentation } from './ReviewDeckPresentation'

vi.mock('./reviewDeckAdapter', async (importOriginal) => {
  const original = await importOriginal<typeof import('./reviewDeckAdapter')>()
  return {
    ...original,
    loadReviewDeckCandidates: vi.fn(),
    saveReviewDeckCandidate: vi.fn(),
  }
})

const loadCandidates = vi.mocked(loadReviewDeckCandidates)
const saveCandidate = vi.mocked(saveReviewDeckCandidate)
const collection: CollectionDefinition = {
  id: 'saved-view::atom-review.yml',
  label: 'Atom 审阅',
  origin: 'saved-view',
  selection: { kind: 'view', filename: 'atom-review.yml' },
  presentation: {
    type: 'custom',
    provider: 'review-deck',
    options: {},
  },
  view: {
    filename: 'atom-review.yml',
    definition: {
      name: 'Atom 审阅',
      icon: null,
      color: null,
      sort: null,
      filters: { all: [] },
    },
  },
}
const props: CollectionPresentationProviderProps = {
  collection,
  entries: [makeEntry({
    path: '/vault/articles/example/digest.md',
    filename: 'digest.md',
    title: '示例 · 拆解综述',
  })],
  loading: false,
  vaultPath: '/vault',
  readNote: vi.fn(),
  writeNote: vi.fn(),
  refreshVault: vi.fn(),
  navigateNote: vi.fn(),
}

describe('ReviewDeckPresentation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saveCandidate.mockResolvedValue('# updated digest')
  })

  it('does not expose bundled prototype cards while real candidates are loading or empty', async () => {
    loadCandidates.mockResolvedValue([])

    const { container } = render(<ReviewDeckPresentation {...props} />)

    expect(screen.getByText('正在加载审阅卡片...')).toBeInTheDocument()
    expect(await screen.findByText('当前视图没有可审阅的 Atom')).toBeInTheDocument()
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
  })

  it('mounts the approved Review Deck only after real candidates load', async () => {
    loadCandidates.mockResolvedValue([{ id: 'article#A001' } as ReviewDeckCandidate])

    render(<ReviewDeckPresentation {...props} />)

    const frame = await screen.findByTitle('Atom 审阅')
    expect(frame).toHaveAttribute('src', '/review-deck/index.html')
  })

  it('refreshes Tolaria after a Deck decision is persisted', async () => {
    loadCandidates.mockResolvedValue([{
      id: 'article#A001',
      ref: 'article-A001',
      digest: '/vault/articles/example/digest.md',
    } as ReviewDeckCandidate])
    const refreshVault = vi.fn(async () => {})

    render(<ReviewDeckPresentation {...props} refreshVault={refreshVault} />)

    const frame = await screen.findByTitle('Atom 审阅') as HTMLIFrameElement
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      origin: window.location.origin,
      data: {
        type: 'review-deck:save-decision',
        candidate: {
          id: 'article#A001',
          ref: 'article-A001',
          digest: '/vault/articles/example/digest.md',
        },
        review: {
          action: 'inbox',
          rating: '5',
          evidence: 'strong',
          resonance: 'high',
          reuse: ['文章'],
        },
      },
    }))

    await waitFor(() => expect(saveCandidate).toHaveBeenCalledOnce())
    expect(refreshVault).toHaveBeenCalledOnce()
  })

  it('routes Deck source, topic, article, and digest-anchor navigation through Tolaria', async () => {
    loadCandidates.mockResolvedValue([{
      id: 'article#A001',
      ref: 'article-A001',
      digest: '/vault/articles/example/digest.md',
    } as ReviewDeckCandidate])
    const navigateNote = vi.fn(async () => true)

    render(<ReviewDeckPresentation {...props} navigateNote={navigateNote} />)

    const frame = await screen.findByTitle('Atom 审阅') as HTMLIFrameElement
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      origin: window.location.origin,
      data: {
        type: 'review-deck:navigate',
        navigation: {
          kind: 'digest',
          target: '/vault/articles/example/digest.md',
          anchor: 'article-A001',
        },
      },
    }))

    await waitFor(() => expect(navigateNote).toHaveBeenCalledWith({
      target: '/vault/articles/example/digest.md',
      anchor: 'article-A001',
    }))
  })
})
