import type { Context } from '@deepseek-ai/cordis'
import { MessageId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { deleteTurn, TurnDeleteError } from './turn-delete.ts'

export { TURN_DELETE_PATH } from './shared.ts'
const MAX_BODY_BYTES = 16 * 1024

interface HttpRequestLike {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  on(event: 'data', listener: (chunk: Uint8Array | string) => void): this
  on(event: 'end', listener: () => void): this
  on(event: 'error', listener: (error: unknown) => void): this
}

interface HttpResponseLike {
  writeHead(status: number, headers?: Record<string, string>): unknown
  end(body?: string): void
}

export interface HttpServerLike {
  register(route: {
    kind: 'exact'
    path: string
    handler: (request: HttpRequestLike, response: HttpResponseLike) => void | Promise<void>
  }): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: HttpServerLike
  }
}

interface DeleteRequest {
  sessionId: string
  assistantMessageId: string
}

function decodeRequest(value: unknown): DeleteRequest {
  if (typeof value !== 'object' || value === null) throw new TypeError('request body must be an object')
  const record = value as Record<string, unknown>
  if (typeof record.sessionId !== 'string' || record.sessionId.length === 0) {
    throw new TypeError('sessionId must be a non-empty string')
  }
  if (typeof record.assistantMessageId !== 'string' || record.assistantMessageId.length === 0) {
    throw new TypeError('assistantMessageId must be a non-empty string')
  }
  return { sessionId: record.sessionId, assistantMessageId: record.assistantMessageId }
}

function requestJson(request: HttpRequestLike): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder()
    let text = ''
    let bytes = 0
    let settled = false
    request.on('data', (chunk) => {
      if (settled) return
      bytes += typeof chunk === 'string' ? new TextEncoder().encode(chunk).length : chunk.byteLength
      if (bytes > MAX_BODY_BYTES) {
        settled = true
        reject(new TypeError('request body is too large'))
        return
      }
      text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    })
    request.on('end', () => {
      if (settled) return
      settled = true
      try {
        text += decoder.decode()
        resolve(JSON.parse(text) as unknown)
      } catch (error: unknown) {
        reject(error)
      }
    })
    request.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

function respondJson(response: HttpResponseLike, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

export async function handleTurnDelete(
  ctx: Context,
  request: HttpRequestLike,
  response: HttpResponseLike,
): Promise<void> {
  if (request.method !== 'POST') {
    response.writeHead(405, { allow: 'POST' })
    response.end()
    return
  }
  const contentType = request.headers?.['content-type']
  if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('application/json')) {
    respondJson(response, 415, { ok: false, error: { code: 'INVALID_REQUEST', message: 'application/json required' } })
    return
  }
  try {
    const input = decodeRequest(await requestJson(request))
    const sessionId = SessionId(input.sessionId)
    const agent = ctx.agents.get(sessionId)
    if (agent === undefined) {
      throw new TurnDeleteError('TARGET_NOT_FOUND', `session "${input.sessionId}" is not active`)
    }
    const value = await deleteTurn(ctx, agent, MessageId(input.assistantMessageId))
    respondJson(response, 200, { ok: true, value })
  } catch (error: unknown) {
    if (error instanceof TurnDeleteError) {
      respondJson(response, error.code === 'AGENT_BUSY' ? 423 : 409, {
        ok: false,
        error: { code: error.code, message: error.message },
      })
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    respondJson(response, 400, { ok: false, error: { code: 'INVALID_REQUEST', message } })
  }
}
