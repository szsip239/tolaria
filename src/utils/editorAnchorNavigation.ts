export interface EditorAnchorNavigationRequest {
  path: string
  anchor: string
}

export const EDITOR_ANCHOR_NAVIGATION_EVENT = 'tolaria:editor-anchor-navigation'

let pendingRequest: EditorAnchorNavigationRequest | null = null

export function requestEditorAnchorNavigation(request: EditorAnchorNavigationRequest): void {
  pendingRequest = request
  window.dispatchEvent(new CustomEvent<EditorAnchorNavigationRequest>(
    EDITOR_ANCHOR_NAVIGATION_EVENT,
    { detail: request },
  ))
}

export function pendingEditorAnchorNavigation(path: string): EditorAnchorNavigationRequest | null {
  return pendingRequest?.path === path ? pendingRequest : null
}

export function completeEditorAnchorNavigation(request: EditorAnchorNavigationRequest): void {
  if (
    pendingRequest?.path === request.path
    && pendingRequest.anchor === request.anchor
  ) {
    pendingRequest = null
  }
}
