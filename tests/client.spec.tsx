// @vitest-environment jsdom

import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAssistantMessage, MessageId } from '@deepseek-ai/dsh-llm'
import { concealDeletedTurn } from '../src/client/DeletedTurnMarker.tsx'
import { TurnDeleteAction, type DeleteTurnResponse } from '../src/client/TurnDeleteAction.tsx'
import { zh } from '../src/client/locales.ts'
import { turnDeletionDefinition } from '../src/client/turn-deletion.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const React = await import('react')
  return {
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement('button', props, children),
    IconTrashOutline16: () => React.createElement('span', null, 'trash'),
    Tooltip: ({ children }: { children: React.ReactNode }) => children,
    Modal: ({ open, title, description, footer, children }: {
      open: boolean
      title: string
      description: string
      footer: React.ReactNode
      children: React.ReactNode
    }) => open ? React.createElement('div', { role: 'dialog' },
      React.createElement('h2', null, title),
      React.createElement('p', null, description),
      children,
      footer) : null,
  }
})

afterEach(cleanup)

function flow(kind: string, child?: HTMLElement): HTMLElement {
  const row = document.createElement('div')
  row.dataset.chatFlowKind = kind
  if (child !== undefined) row.append(child)
  return row
}

function tail(turn: number, marker?: HTMLElement): HTMLElement {
  const root = document.createElement('div')
  root.dataset.turnTail = String(turn)
  if (marker !== undefined) root.append(marker)
  return flow('turn-tail', root)
}

describe('deleted turn presentation', () => {
  it('hides only the rows between adjacent turn tails and restores them on disposal', () => {
    const list = document.createElement('div')
    const firstUser = flow('user')
    const firstAssistant = flow('assistant-step')
    const firstTail = tail(1)
    const secondUser = flow('user')
    const secondTool = flow('tool-call')
    const secondAssistant = flow('assistant-step')
    const marker = document.createElement('span')
    const secondTail = tail(2, marker)
    const thirdUser = flow('user')
    list.append(firstUser, firstAssistant, firstTail, secondUser, secondTool, secondAssistant, secondTail, thirdUser)

    const restore = concealDeletedTurn(marker, 2)

    expect([firstUser, firstAssistant, firstTail, thirdUser].every(row => !row.hidden)).toBe(true)
    expect([secondUser, secondTool, secondAssistant, secondTail].every(row => row.hidden)).toBe(true)
    restore()
    expect([...list.children].every(row => !(row as HTMLElement).hidden)).toBe(true)
  })

  it('recognizes only the plugin tombstone', () => {
    const ordinary = {
      type: 'assistant/message', seq: 1, time: 1, surfaceOp: 'append',
      data: { turn: 1, step: 1, message: createAssistantMessage({
        content: [], source: { provider: 'test', model: 'test' },
      }) },
    } as unknown as Parameters<typeof turnDeletionDefinition.match>[0]
    expect(turnDeletionDefinition.match(ordinary)).toBeNull()

    const tombstone = {
      type: 'assistant/message', seq: 2, time: 2,
      surfaceOp: { op: 'replace', start: 1, end: 2 },
      sourceEventSeqs: [1],
      data: { turn: 1, step: 1, message: createAssistantMessage({
        content: [], source: { provider: 'dsh-turn-delete', model: 'tombstone' },
      }) },
    } as unknown as Parameters<typeof turnDeletionDefinition.match>[0]
    expect(turnDeletionDefinition.match(tombstone)).toEqual({ id: '1', role: 'start' })
  })
})

const t = (key: keyof typeof zh): string => zh[key]

function mountAction(result: DeleteTurnResponse = { ok: true, value: { turn: 1, seq: 9 } }) {
  const snapshot = { running: false, subagent: null }
  const useSession = (<T,>(select: (value: typeof snapshot) => T): T =>
    useSyncExternalStore(() => () => {}, () => select(snapshot))) as never
  const deleteTurn = vi.fn(() => Promise.resolve(result))
  const props = {
    messageId: MessageId('assistant-1'),
    deleteTurn,
    useSession,
    t,
  } as unknown as Parameters<typeof TurnDeleteAction>[0]
  return { ...render(<TurnDeleteAction {...props} />), deleteTurn }
}

describe('TurnDeleteAction', () => {
  it('requires confirmation before deleting the addressed assistant turn', async () => {
    const ui = mountAction()
    fireEvent.click(screen.getByLabelText(zh['action.delete']))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(ui.deleteTurn).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: zh['dialog.confirm'] }))
    await waitFor(() => { expect(ui.deleteTurn).toHaveBeenCalledWith(MessageId('assistant-1')) })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('keeps the dialog open for a compacted-turn refusal', async () => {
    mountAction({ ok: false, error: { code: 'TURN_COMPACTED', message: 'compacted' } })
    fireEvent.click(screen.getByLabelText(zh['action.delete']))
    fireEvent.click(screen.getByRole('button', { name: zh['dialog.confirm'] }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(zh['error.compacted']) })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
