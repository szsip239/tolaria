import { createElement, type ComponentType } from 'react'
import type { VaultEntry } from '../types'
import type { CollectionDefinition } from './collectionTypes'

export interface CollectionPresentationProviderProps {
  collection: CollectionDefinition
  entries: VaultEntry[]
  loading: boolean
  vaultPath: string | null
  readNote: (path: string) => Promise<string>
  writeNote: (path: string, content: string) => Promise<void>
  refreshVault: () => Promise<unknown>
}

export type CollectionPresentationProvider = ComponentType<CollectionPresentationProviderProps>
export type CollectionPresentationProviders = Record<string, CollectionPresentationProvider>

export function resolveCollectionPresentationProvider(
  collection: CollectionDefinition,
  providers: CollectionPresentationProviders,
): CollectionPresentationProvider | null {
  if (collection.presentation.type !== 'custom') return null
  return providers[collection.presentation.provider] ?? null
}

export function CollectionPresentationHost(
  props: CollectionPresentationProviderProps & {
    providers: CollectionPresentationProviders
  },
) {
  const { providers, ...providerProps } = props
  const provider = resolveCollectionPresentationProvider(props.collection, providers)
  return provider ? createElement(provider, providerProps) : null
}
