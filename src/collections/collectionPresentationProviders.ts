import type { CollectionPresentationProviders } from './collectionPresentationHost'
import { ReviewDeckPresentation } from '../features/review-deck/ReviewDeckPresentation'

export const collectionPresentationProviders: CollectionPresentationProviders = {
  'review-deck': ReviewDeckPresentation,
}
