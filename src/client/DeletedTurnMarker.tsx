import { useLayoutEffect, useRef } from 'react'
import type { DeletedTurnData } from './turn-deletion.ts'

interface HiddenRow {
  readonly element: HTMLElement
  readonly hidden: boolean
}

let ownerSequence = 0

function turnRows(marker: HTMLElement): HTMLElement[] {
  const tail = marker.closest<HTMLElement>('[data-turn-tail]')
  const tailRow = tail?.closest<HTMLElement>('[data-chat-flow-kind="turn-tail"]')
  if (tailRow === undefined || tailRow === null) return []
  const rows = [tailRow]
  let cursor = tailRow.previousElementSibling
  while (cursor instanceof HTMLElement) {
    if (cursor.querySelector('[data-turn-tail]') !== null) break
    rows.push(cursor)
    cursor = cursor.previousElementSibling
  }
  return rows
}

export function concealDeletedTurn(marker: HTMLElement, turn: number): () => void {
  const owner = `${String(turn)}-${String(++ownerSequence)}`
  const changed: HiddenRow[] = []
  for (const element of turnRows(marker)) {
    changed.push({ element, hidden: element.hidden })
    element.dataset.dshTurnDeleteOwner = owner
    element.hidden = true
  }
  return () => {
    for (const entry of changed) {
      if (entry.element.dataset.dshTurnDeleteOwner !== owner) continue
      delete entry.element.dataset.dshTurnDeleteOwner
      entry.element.hidden = entry.hidden
    }
  }
}

export function DeletedTurnMarker({ matched }: { matched: DeletedTurnData }) {
  const markerRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const marker = markerRef.current
    if (marker === null) return
    const tailRow = marker.closest<HTMLElement>('[data-chat-flow-kind="turn-tail"]')
    const list = tailRow?.parentElement
    if (list === undefined || list === null) return
    let restore = concealDeletedTurn(marker, matched.turn)
    const observer = new MutationObserver(() => {
      restore()
      restore = concealDeletedTurn(marker, matched.turn)
    })
    observer.observe(list, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      restore()
    }
  }, [matched.turn])
  return <span ref={markerRef} data-dsh-deleted-turn={matched.turn} hidden />
}
