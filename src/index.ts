import type { Context } from '@deepseek-ai/cordis'
import { handleTurnDelete, TURN_DELETE_PATH } from './http.ts'

export { TURN_DELETE_PATH } from './http.ts'
export {
  deleteTurn,
  isTurnDeleteEvent,
  TOMBSTONE_MODEL,
  TOMBSTONE_PROVIDER,
  TurnDeleteError,
  type TurnDeleteErrorCode,
  type TurnDeleteReceipt,
} from './turn-delete.ts'

export const name = 'turn-delete'
export const inject = ['sessions', 'agents', 'webServer']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TURN_DELETE_PATH,
    handler: (request, response) => handleTurnDelete(ctx, request, response),
  }), 'turn-delete: HTTP route')
}
