import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TOMBSTONE_MODEL, TOMBSTONE_PROVIDER } from '../shared.ts'

export interface DeletedTurnData {
  readonly hidden: true
  readonly turn: number
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationTurnDataMap {
    'turn-delete': DeletedTurnData
  }
}

function deletedTurn(event: Parameters<ConversationNodeDefinition['match']>[0]): number | undefined {
  return event.type === 'assistant/message'
    && typeof event.surfaceOp === 'object'
    && event.data.message.content.length === 0
    && event.data.message.source.provider === TOMBSTONE_PROVIDER
    && event.data.message.source.model === TOMBSTONE_MODEL
    ? event.data.turn
    : undefined
}

interface DeletedTurnState {
  readonly turn: number
}

export const turnDeletionDefinition: ConversationNodeDefinition<DeletedTurnState> = {
  kind: 'turn-delete',
  match: (event) => {
    const turn = deletedTurn(event)
    return turn === undefined ? null : { id: String(turn), role: 'start' }
  },
  start: (_context, match) => {
    const turn = deletedTurn(match.event)
    if (turn === undefined) throw new Error('turn-delete start requires a deletion tombstone')
    return { turn }
  },
  update: context => context.state,
  publication: () => 'immediate',
  buildLocationData: (context, scope) => {
    if (scope !== 'turn' || context.state === undefined) return null
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'turn-delete',
      value: { hidden: true, turn: context.state.turn },
    }
  },
}

export function selectDeletedTurn(owner: TurnTailOwnerProps): DeletedTurnData | null {
  const data = owner.turn.data.get('turn-delete')
  return data?.hidden === true ? data : null
}
