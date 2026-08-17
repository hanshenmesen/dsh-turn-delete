import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TURN_DELETE_PATH } from '../shared.ts'
import { DeletedTurnMarker } from './DeletedTurnMarker.tsx'
import { en, zh } from './locales.ts'
import { TurnDeleteAction, type DeleteTurnResponse } from './TurnDeleteAction.tsx'
import { selectDeletedTurn, turnDeletionDefinition } from './turn-deletion.ts'

const NS = 'turn-delete'

export const inject = ['slots', 'locale', 'conversationEvents']

async function postDelete(sessionId: string, assistantMessageId: MessageId): Promise<DeleteTurnResponse> {
  const response = await fetch(TURN_DELETE_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, assistantMessageId }),
  })
  const value = await response.json() as DeleteTurnResponse
  if (typeof value !== 'object' || value === null || typeof value.ok !== 'boolean') {
    throw new Error(`turn deletion returned HTTP ${String(response.status)}`)
  }
  return value
}

export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(turnDeletionDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'turn-delete: dictionaries')
  ctx.slots.inject('conversation.chat.assistant-actions', () =>
    ctx.slots.register({
      name: 'conversation.chat.assistant-actions',
      id: 'turn-delete',
      order: 90,
      locale: NS,
      inject: sessionId => ({
        deleteTurn: (assistantMessageId: MessageId) => postDelete(sessionId, assistantMessageId),
      }),
    }, TurnDeleteAction))
  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register({
      name: 'conversation.chat.turnTail',
      select: selectDeletedTurn,
    }, DeletedTurnMarker))
}
