import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createAssistantMessage, type MessageId } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { isAppendSurfaceEvent, isReplacementSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import { TOMBSTONE_MODEL, TOMBSTONE_PROVIDER } from './shared.ts'

export { TOMBSTONE_MODEL, TOMBSTONE_PROVIDER } from './shared.ts'

export type TurnDeleteErrorCode =
  | 'TARGET_NOT_FOUND'
  | 'TURN_NOT_CLOSED'
  | 'TURN_COMPACTED'
  | 'AGENT_BUSY'

export interface TurnDeleteReceipt {
  readonly turn: number
  readonly seq: number
}

export class TurnDeleteError extends Error {
  override readonly name = 'TurnDeleteError'

  constructor(readonly code: TurnDeleteErrorCode, message: string) {
    super(message)
  }
}

export function isTurnDeleteEvent(
  event: SessionEvent,
): event is SessionEvent<'assistant/message'> & { surfaceOp: { op: 'replace'; start: number; end: number } } {
  return event.type === 'assistant/message'
    && isReplacementSurfaceEvent(event)
    && event.data.message.content.length === 0
    && event.data.message.source.provider === TOMBSTONE_PROVIDER
    && event.data.message.source.model === TOMBSTONE_MODEL
}

function eventTurn(event: SessionEvent): number | undefined {
  if (event.type === 'assistant/message' || event.type === 'tool/result') return event.data.turn
  return undefined
}

function turnBracket(
  events: readonly SessionEvent[],
  turn: number,
  targetSeq: number,
): { start: number; end: number } | undefined {
  const start = events.findLast(event =>
    event.seq <= targetSeq && event.type === 'turn/start' && event.data.turn === turn)
  const end = events.find(event =>
    event.seq >= targetSeq && event.type === 'turn/end' && event.data.turn === turn)
  return start === undefined || end === undefined ? undefined : { start: start.seq, end: end.seq }
}

function originBelongsToTurn(
  event: SessionEvent,
  turn: number,
  bracket: { start: number; end: number },
): boolean {
  return (event.seq > bracket.start && event.seq < bracket.end) || eventTurn(event) === turn
}

function surfaceOrigins(
  seq: number,
  events: readonly SessionEvent[],
  memo: Map<number, ReadonlySet<number>>,
  visiting = new Set<number>(),
): ReadonlySet<number> {
  const cached = memo.get(seq)
  if (cached !== undefined) return cached
  if (visiting.has(seq)) return new Set()
  visiting.add(seq)
  const event = events[seq]
  const origins = new Set<number>()
  if (event !== undefined) {
    if (isAppendSurfaceEvent(event)) origins.add(seq)
    const sources = (event as SessionEvent & { sourceEventSeqs?: readonly number[] }).sourceEventSeqs ?? []
    for (const source of sources) {
      for (const origin of surfaceOrigins(source, events, memo, visiting)) origins.add(origin)
    }
  }
  visiting.delete(seq)
  memo.set(seq, origins)
  return origins
}

async function deleteUnderMaintenance(
  ctx: Context,
  agent: Agent,
  assistantMessageId: MessageId,
  signal: AbortSignal,
): Promise<TurnDeleteReceipt> {
  signal.throwIfAborted()
  const session = agent.session
  if (ctx.sessions.get(session.id) !== session) {
    throw new TurnDeleteError('TARGET_NOT_FOUND', `session "${session.id}" is no longer live`)
  }
  const events = session.events
  const target = events.find((event): event is SessionEvent<'assistant/message'> =>
    event.type === 'assistant/message'
    && isAppendSurfaceEvent(event)
    && event.data.message.id === assistantMessageId)
  if (target === undefined) {
    throw new TurnDeleteError('TARGET_NOT_FOUND', `assistant message "${assistantMessageId}" was not found`)
  }
  const turn = target.data.turn
  const existing = events.find(event => isTurnDeleteEvent(event) && event.data.turn === turn)
  if (existing !== undefined) return { turn, seq: existing.seq }

  const bracket = turnBracket(events, turn, target.seq)
  if (bracket === undefined) {
    throw new TurnDeleteError('TURN_NOT_CLOSED', `turn ${String(turn)} is not closed`)
  }

  const originSeqs = new Set(events
    .filter(event => isAppendSurfaceEvent(event) && originBelongsToTurn(event, turn, bracket))
    .map(event => event.seq))
  const currentNodes = session.surface.nodes
  if (!currentNodes.includes(target.seq)) {
    throw new TurnDeleteError('TURN_COMPACTED', `turn ${String(turn)} is no longer independently deletable`)
  }

  const memo = new Map<number, ReadonlySet<number>>()
  const selected: number[] = []
  const covered = new Set<number>()
  for (const seq of currentNodes) {
    const origins = surfaceOrigins(seq, events, memo)
    const targetOrigins = [...origins].filter(origin => originSeqs.has(origin))
    if (targetOrigins.length === 0) continue
    if ([...origins].some(origin => !originSeqs.has(origin))) {
      throw new TurnDeleteError('TURN_COMPACTED', `turn ${String(turn)} shares a compacted surface node`)
    }
    const current = events[seq]
    if (current !== undefined && !originSeqs.has(seq)
      && !(current.type === 'tool/result' && current.data.turn === turn)) {
      throw new TurnDeleteError('TURN_COMPACTED', `turn ${String(turn)} contains a non-local replacement`)
    }
    selected.push(seq)
    for (const origin of targetOrigins) covered.add(origin)
  }
  if ([...originSeqs].some(origin => !covered.has(origin)) || selected.length === 0) {
    throw new TurnDeleteError('TURN_COMPACTED', `turn ${String(turn)} is partially compacted`)
  }
  const positions = selected.map(seq => currentNodes.indexOf(seq))
  const first = positions[0]
  if (first === undefined || positions.some((position, index) => position !== first + index)) {
    throw new TurnDeleteError('TURN_COMPACTED', `turn ${String(turn)} is not a contiguous surface span`)
  }

  signal.throwIfAborted()
  const tombstone = session.append('assistant/message', {
    turn,
    step: target.data.step,
    message: createAssistantMessage({
      content: [],
      source: { provider: TOMBSTONE_PROVIDER, model: TOMBSTONE_MODEL },
    }),
  }, {
    surfaceOp: { op: 'replace', start: selected[0] as number, end: selected.at(-1) as number },
    sourceEventSeqs: selected,
  })
  await ctx.sessions.flush(session)
  return { turn, seq: tombstone.seq }
}

export async function deleteTurn(
  ctx: Context,
  agent: Agent,
  assistantMessageId: MessageId,
): Promise<TurnDeleteReceipt> {
  try {
    return await agent.runMaintenance(signal =>
      deleteUnderMaintenance(ctx, agent, assistantMessageId, signal))
  } catch (error: unknown) {
    if (error instanceof TurnDeleteError) throw error
    throw new TurnDeleteError('AGENT_BUSY', error instanceof Error ? error.message : String(error))
  }
}
