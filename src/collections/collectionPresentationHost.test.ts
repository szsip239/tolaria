import { describe, expect, it, vi } from 'vitest'
import type { CollectionDefinition } from './collectionTypes'
import { resolveCollectionPresentationProvider } from './collectionPresentationHost'

function customCollection(provider: string): CollectionDefinition {
  return {
    id: 'saved-view::atom-review.yml',
    label: 'Atom Review',
    origin: 'saved-view',
    selection: { kind: 'view', filename: 'atom-review.yml' },
    presentation: {
      type: 'custom',
      provider,
      options: {},
    },
  }
}

describe('resolveCollectionPresentationProvider', () => {
  it('returns the installed provider selected by a custom collection presentation', () => {
    const provider = vi.fn()

    expect(resolveCollectionPresentationProvider(customCollection('review-deck'), {
      'review-deck': provider,
    })).toBe(provider)
  })

  it('falls back to the standard workspace for list or unavailable custom presentations', () => {
    const listCollection: CollectionDefinition = {
      ...customCollection('review-deck'),
      presentation: { type: 'list', sort: null, properties: [] },
    }

    expect(resolveCollectionPresentationProvider(listCollection, {})).toBeNull()
    expect(resolveCollectionPresentationProvider(customCollection('missing'), {})).toBeNull()
  })
})
