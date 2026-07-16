import type { FilterGroup, SidebarSelection, VaultEntry, ViewFile } from '../types'

export const COLLECTION_PRESENTATION_LIST = 'list'
export const COLLECTION_PRESENTATION_CUSTOM = 'custom'

export type CollectionPresentationType =
  | typeof COLLECTION_PRESENTATION_LIST
  | typeof COLLECTION_PRESENTATION_CUSTOM

export interface ListCollectionPresentationConfig {
  type: typeof COLLECTION_PRESENTATION_LIST
  sort: string | null
  properties: string[]
}

export interface CustomCollectionPresentationConfig {
  type: typeof COLLECTION_PRESENTATION_CUSTOM
  provider: string
  options: Record<string, unknown>
}

export type CollectionPresentationConfig =
  | ListCollectionPresentationConfig
  | CustomCollectionPresentationConfig

export type CollectionOrigin = 'builtin' | 'type' | 'folder' | 'saved-view' | 'neighborhood'

export interface CollectionDefinition {
  id: string
  label: string
  origin: CollectionOrigin
  selection: SidebarSelection
  presentation: CollectionPresentationConfig
  filter?: FilterGroup
  entry?: VaultEntry
  view?: ViewFile
}
