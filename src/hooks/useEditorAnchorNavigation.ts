import { useCallback, useEffect, type RefObject } from 'react'
import {
  completeEditorAnchorNavigation,
  EDITOR_ANCHOR_NAVIGATION_EVENT,
  pendingEditorAnchorNavigation,
  type EditorAnchorNavigationRequest,
} from '../utils/editorAnchorNavigation'

type NavigableEditorBlock = {
  id?: unknown
  content?: unknown
  children?: unknown
}

interface AnchorNavigationEditor {
  document: readonly unknown[]
  setTextCursorPosition: (blockId: string, placement: 'start') => void
}

function inlineText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => {
    if (typeof part === 'string') return part
    if (typeof part !== 'object' || part === null) return ''
    const text = Reflect.get(part, 'text')
    if (typeof text === 'string') return text
    return inlineText(Reflect.get(part, 'content'))
  }).join('')
}

function findAnchorBlock(blocks: readonly unknown[], anchor: string): NavigableEditorBlock | null {
  for (const candidate of blocks) {
    if (typeof candidate !== 'object' || candidate === null) continue
    const block = candidate as NavigableEditorBlock
    if (inlineText(block.content).includes(anchor)) return block
    if (Array.isArray(block.children)) {
      const child = findAnchorBlock(block.children, anchor)
      if (child) return child
    }
  }
  return null
}

function blockElement(container: HTMLElement, blockId: string): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-id]'))
    .find((element) => element.dataset.id === blockId) ?? null
}

export function useEditorAnchorNavigation({
  containerRef,
  currentContent,
  editor,
  path,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  currentContent: string
  editor: AnchorNavigationEditor
  path: string | undefined
}) {
  const navigate = useCallback((request?: EditorAnchorNavigationRequest) => {
    if (!path) return false
    const target = request?.path === path ? request : pendingEditorAnchorNavigation(path)
    if (!target) return false

    const block = findAnchorBlock(editor.document, target.anchor)
    if (!block || typeof block.id !== 'string') return false

    editor.setTextCursorPosition(block.id, 'start')
    requestAnimationFrame(() => {
      const element = containerRef.current && blockElement(containerRef.current, block.id as string)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    completeEditorAnchorNavigation(target)
    return true
  }, [containerRef, editor, path])

  useEffect(() => {
    const handleNavigation = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      navigate(event.detail as EditorAnchorNavigationRequest)
    }
    window.addEventListener(EDITOR_ANCHOR_NAVIGATION_EVENT, handleNavigation)
    navigate()
    return () => window.removeEventListener(EDITOR_ANCHOR_NAVIGATION_EVENT, handleNavigation)
  }, [currentContent, navigate])
}
