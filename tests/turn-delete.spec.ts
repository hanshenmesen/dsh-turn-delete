import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  createAssistantMessage,
  createUserMessage,
  MessageId,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import {
  deleteTurn,
  isTurnDeleteEvent,
  TurnDeleteError,
} from '../src/turn-delete.ts'

function idleAgent(session: ReturnType<Context['sessions']['create']>): Agent {
  return {
    id: session.id,
    session,
    status: 'idle',
    options: {},
    ctx: new Context(),
    inbox: {} as Agent['inbox'],
    cancel: () => {},
    whenIdle: () => Promise.resolve(),
    runMaintenance: task => task(new AbortController().signal),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => {},
  }
}

function appendTurn(
  session: ReturnType<Context['sessions']['create']>,
  turn: number,
  question: string,
  answer: string,
) {
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 1 })
  const user = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: question }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  const assistant = session.append('assistant/message', {
    turn,
    step: 1,
    message: createAssistantMessage({
      content: [{ type: 'text', text: answer }],
      source: { provider: 'test', model: 'test' },
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step: 1 })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
  return { user, assistant }
}

describe('deleteTurn', () => {
  it('removes one middle turn from the model surface and survives replay', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('middle-turn'))
    appendTurn(session, 1, 'q1', 'a1')
    const middle = appendTurn(session, 2, 'q2-secret', 'a2-secret')
    appendTurn(session, 3, 'q3', 'a3')

    const receipt = await deleteTurn(ctx, idleAgent(session), middle.assistant.data.message.id)

    expect(receipt.turn).toBe(2)
    const tombstone = session.events[receipt.seq]
    expect(tombstone).toBeDefined()
    if (tombstone === undefined) throw new Error('missing turn deletion tombstone')
    expect(isTurnDeleteEvent(tombstone)).toBe(true)
    expect(session.surface.nodes).not.toContain(middle.user.seq)
    expect(session.surface.nodes).not.toContain(middle.assistant.seq)
    expect(session.deriveMessages().flatMap(message => message.content)
      .filter(block => block.type === 'text').map(block => block.text))
      .toEqual(['q1', 'a1', 'q3', 'a3'])

    const replayed = Session.create(SessionId('middle-turn-replay'), structuredClone(session.events))
    expect(replayed.deriveMessages().flatMap(message => message.content)
      .filter(block => block.type === 'text').map(block => block.text))
      .toEqual(['q1', 'a1', 'q3', 'a3'])
  })

  it('is idempotent for a stale retry', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('retry'))
    const target = appendTurn(session, 1, 'q', 'a')
    const agent = idleAgent(session)

    const first = await deleteTurn(ctx, agent, target.assistant.data.message.id)
    const second = await deleteTurn(ctx, agent, target.assistant.data.message.id)

    expect(second).toEqual(first)
    expect(session.events.filter(isTurnDeleteEvent)).toHaveLength(1)
  })

  it('refuses open, missing, and compacted targets', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)

    const open = ctx.sessions.create(SessionId('open'))
    open.append('turn/start', { turn: 1 })
    open.append('step/start', { turn: 1, step: 1 })
    const assistant = open.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: 'running' }],
        source: { provider: 'test', model: 'test' },
      }),
    }, { surfaceOp: 'append' })
    await expect(deleteTurn(ctx, idleAgent(open), assistant.data.message.id))
      .rejects.toMatchObject({ code: 'TURN_NOT_CLOSED' } satisfies Partial<TurnDeleteError>)

    const compacted = ctx.sessions.create(SessionId('compacted'))
    const target = appendTurn(compacted, 1, 'secret', 'answer')
    compacted.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'summary' }],
      source: { kind: 'plugin', plugin: 'compact' },
    }), {
      surfaceOp: { op: 'replace', start: target.user.seq, end: target.user.seq },
      sourceEventSeqs: [target.user.seq],
    })
    await expect(deleteTurn(ctx, idleAgent(compacted), target.assistant.data.message.id))
      .rejects.toMatchObject({ code: 'TURN_COMPACTED' } satisfies Partial<TurnDeleteError>)

    await expect(deleteTurn(ctx, idleAgent(compacted), MessageId('missing')))
      .rejects.toMatchObject({ code: 'TARGET_NOT_FOUND' } satisfies Partial<TurnDeleteError>)
  })
})
