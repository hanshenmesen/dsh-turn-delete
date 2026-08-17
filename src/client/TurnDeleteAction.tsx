import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Button,
  IconTrashOutline16,
  Modal,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

export type DeleteTurnResponse =
  | { ok: true; value: { turn: number; seq: number } }
  | { ok: false; error: { code: string; message: string } }

interface TurnDeleteInjected {
  deleteTurn: (assistantMessageId: MessageId) => Promise<DeleteTurnResponse>
}

type TurnDeleteActionProps = PropsRuntime<'conversation.chat.assistant-actions'>
  & InjectFace<TurnDeleteInjected>
  & PropsLocale<'turn-delete'>

const actionStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 6,
  border: 'none',
  borderRadius: 28,
  background: 'transparent',
  color: 'var(--dsw-alias-label-tertiary)',
  cursor: 'pointer',
}

const confirmStyle: CSSProperties = {
  color: 'var(--dsw-alias-state-error-primary)',
}

const errorStyle: CSSProperties = {
  color: 'var(--dsw-alias-state-error-primary)',
  fontSize: 13,
  lineHeight: 1.5,
}

export function TurnDeleteAction({ messageId, deleteTurn, useSession, t }: TurnDeleteActionProps) {
  const running = useSession(snapshot => snapshot.running)
  const subagent = useSession(snapshot => snapshot.subagent)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  if (subagent !== null) return null
  const unavailable = running || pending
  const close = (): void => {
    if (pending) return
    setOpen(false)
    setError(null)
  }
  const confirm = (): void => {
    if (unavailable) return
    setPending(true)
    setError(null)
    void deleteTurn(messageId).then((result) => {
      if (!alive.current) return
      setPending(false)
      if (result.ok) {
        setOpen(false)
        return
      }
      if (result.error.code === 'AGENT_BUSY') setError(t('error.busy'))
      else if (result.error.code === 'TURN_COMPACTED') setError(t('error.compacted'))
      else if (result.error.code === 'TARGET_NOT_FOUND' || result.error.code === 'TURN_NOT_CLOSED') {
        setError(t('error.unavailable'))
      } else setError(t('error.generic'))
    }).catch(() => {
      if (!alive.current) return
      setPending(false)
      setError(t('error.generic'))
    })
  }
  const label = running ? t('action.busy') : t('action.delete')

  return (
    <>
      <Tooltip label={label} side="bottom">
        <button
          type="button"
          style={{ ...actionStyle, opacity: running ? 0.4 : 1, cursor: running ? 'default' : 'pointer' }}
          aria-label={t('action.delete')}
          aria-disabled={running || undefined}
          onClick={running ? undefined : () => { setOpen(true); setError(null) }}
        >
          <IconTrashOutline16 />
        </button>
      </Tooltip>
      <Modal
        open={open}
        onClose={close}
        closeLabel={t('dialog.cancel')}
        title={t('dialog.title')}
        description={t('dialog.description')}
        footer={(
          <>
            <Button variant="outline" disabled={pending} onClick={close}>{t('dialog.cancel')}</Button>
            <Button
              variant="outline"
              style={confirmStyle}
              disabled={pending || running}
              onClick={confirm}
            >
              {pending ? t('dialog.deleting') : t('dialog.confirm')}
            </Button>
          </>
        )}
      >
        {error !== null && <div style={errorStyle} role="alert">{error}</div>}
      </Modal>
    </>
  )
}
