import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CollectionPresentationProviderProps } from '../../collections/collectionPresentationHost'
import { resolveCollectionEntries } from '../../collections/resolveCollectionEntries'
import {
  loadReviewDeckCandidates,
  saveReviewDeckCandidate,
  type ReviewDeckCandidate,
  type ReviewDeckReviewInput,
} from './reviewDeckAdapter'
import './ReviewDeckPresentation.css'

type DeckMessage =
  | { type: 'review-deck:ready' }
  | {
    type: 'review-deck:save-decision'
    candidate: { id: string; ref: string; digest: string }
    review: {
      action: ReviewDeckReviewInput['action']
      rating: string
      evidence: ReviewDeckReviewInput['evidence']
      resonance: ReviewDeckReviewInput['resonance']
      reuse: string[]
      favorite?: boolean
    }
  }
  | {
    type: 'review-deck:save-note'
    candidate: { id: string; ref: string; digest: string }
    note: { sourceText: string; note: string }
  }
  | {
    type: 'review-deck:navigate'
    navigation: {
      kind: 'source' | 'topic' | 'article' | 'digest'
      target: string
      anchor?: string
    }
  }

const REUSE_VALUES: Record<string, string> = {
  文章: 'article',
  PPT: 'ppt',
  演讲: 'speech',
  研究: 'research',
  项目: 'project',
}

function reviewInput(message: Extract<DeckMessage, { type: 'review-deck:save-decision' }>): ReviewDeckReviewInput {
  return {
    action: message.review.action,
    rating: message.review.rating,
    evidence: message.review.evidence,
    resonance: message.review.resonance,
    reuse: message.review.reuse.map((value) => REUSE_VALUES[value] ?? value),
    favorite: message.review.favorite,
  }
}

function isDeckMessage(value: unknown): value is DeckMessage {
  if (!value || typeof value !== 'object') return false
  const type = Reflect.get(value, 'type')
  return type === 'review-deck:ready'
    || type === 'review-deck:save-decision'
    || type === 'review-deck:save-note'
    || type === 'review-deck:navigate'
}

export function ReviewDeckPresentation({
  collection,
  entries,
  readNote,
  refreshVault,
  writeNote,
  navigateNote,
}: CollectionPresentationProviderProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [loadState, setLoadState] = useState<{
    key: string
    candidates: ReviewDeckCandidate[]
    error: string
  } | null>(null)
  const digestEntries = useMemo(
    () => resolveCollectionEntries(collection, entries).entries,
    [collection, entries],
  )
  const loadKey = useMemo(
    () => digestEntries.map((entry) => entry.path).join('\n'),
    [digestEntries],
  )
  const candidates = loadState?.key === loadKey ? loadState.candidates : null
  const loadError = loadState?.key === loadKey ? loadState.error : ''

  useEffect(() => {
    let cancelled = false
    loadReviewDeckCandidates(digestEntries, readNote)
      .then((loaded) => {
        if (!cancelled) setLoadState({ key: loadKey, candidates: loaded, error: '' })
      })
      .catch((error) => {
        console.error('Review Deck failed to load', error)
        if (!cancelled) {
          setLoadState({
            key: loadKey,
            candidates: [],
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [digestEntries, loadKey, readNote])

  const postCandidates = useCallback(() => {
    if (!candidates?.length) return
    iframeRef.current?.contentWindow?.postMessage({
      type: 'review-deck:init',
      candidates,
    }, window.location.origin)
  }, [candidates])

  useEffect(postCandidates, [postCandidates])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.source !== iframeRef.current?.contentWindow
        || event.origin !== window.location.origin
        || !isDeckMessage(event.data)
      ) return
      if (event.data.type === 'review-deck:ready') {
        postCandidates()
        return
      }
      if (event.data.type === 'review-deck:navigate') {
        void navigateNote({
          target: event.data.navigation.target,
          anchor: event.data.navigation.anchor,
        }).then((opened) => {
          if (opened) return
          iframeRef.current?.contentWindow?.postMessage({
            type: 'review-deck:navigation-error',
            message: '目标笔记尚未建立或不在当前知识库中',
          }, window.location.origin)
        }).catch((error) => {
          iframeRef.current?.contentWindow?.postMessage({
            type: 'review-deck:navigation-error',
            message: error instanceof Error ? error.message : String(error),
          }, window.location.origin)
        })
        return
      }

      const message = event.data
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        try {
          const markdown = await readNote(message.candidate.digest)
          await saveReviewDeckCandidate({
            digestPath: message.candidate.digest,
            markdown,
            atomRef: message.candidate.ref,
            review: message.type === 'review-deck:save-decision' ? reviewInput(message) : undefined,
            note: message.type === 'review-deck:save-note' ? message.note : undefined,
            writeNote,
          })
          await refreshVault()
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'review-deck:saved', atomId: message.candidate.id },
            window.location.origin,
          )
        } catch (error) {
          iframeRef.current?.contentWindow?.postMessage({
            type: 'review-deck:error',
            atomId: message.candidate.id,
            message: error instanceof Error ? error.message : String(error),
          }, window.location.origin)
        }
      })
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [navigateNote, postCandidates, readNote, refreshVault, writeNote])

  if (candidates === null) {
    return <div className="review-deck-presentation-state">正在加载审阅卡片...</div>
  }

  if (!candidates.length) {
    return (
      <div className="review-deck-presentation-state">
        <strong>当前视图没有可审阅的 Atom</strong>
        {loadError && <span>{loadError}</span>}
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      className="review-deck-presentation"
      src="/review-deck/index.html"
      title={collection.label}
    />
  )
}
