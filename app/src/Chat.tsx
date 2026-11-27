// Chat with one friend (VTTER-109, docs/adr/0010-friend-chat.md): plain text, so players can set up a session.
// There is no push: the open thread asks the API for anything new every few seconds while the tab is visible.
// Message text is only ever rendered as text. The API answers 404 for anyone who isn't a friend.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { friendsApi } from './api/client.ts'
import type { ChatMessage, Person } from './api/types.ts'
import type { Auth } from './auth/useAuth.ts'
import { canSend, charsLeft, CHAT_LIMITS, hasFromThem, mergeMessages, newestId, POLL_SECONDS } from './engine/chat.ts'
import { personName } from './engine/friends.ts'
import Link from './Link.tsx'
import Shell, { LoadState } from './Shell.tsx'
import { announceRead } from './useUnread.ts'
import { useLoad } from './useLoad.ts'

const isNotFound = (e: unknown) => (e as { status?: number }).status === 404
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')
/** Show the character counter only when the limit is getting close. */
const COUNTER_FROM = 100

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The thread with one friend. Takes the person, so a test can render it without loading the friends list. */
export function ChatView({ person }: { person: Person }) {
  const id = person.playerId
  const name = personName(person)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasOlder, setHasOlder] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'gone'>('loading')
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [lagging, setLagging] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const latest = useRef<string | undefined>(undefined)
  const log = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const anchorHeight = useRef<number | null>(null)
  useEffect(() => { latest.current = newestId(messages) }, [messages])

  /** Tell the API the thread has been seen, then clear the dot on the Friends link. Failing is harmless. */
  const markRead = useCallback(() => {
    Promise.resolve().then(() => friendsApi.markRead(id)).then(announceRead, () => {})
  }, [id])

  // Open the thread: the newest page.
  useEffect(() => {
    let live = true
    friendsApi.messages(id).then(
      page => {
        if (!live) return
        setMessages(page.messages)
        setHasOlder(page.hasMore)
        setStatus('ready')
        if (hasFromThem(page.messages)) markRead()
      },
      e => {
        if (!live) return
        if (isNotFound(e)) setStatus('gone')
        else { setLoadError(messageOf(e)); setStatus('error') }
      },
    )
    return () => { live = false }
  }, [id, attempt, markRead])

  // Keep it fresh while the tab is visible.
  useEffect(() => {
    if (status !== 'ready') return
    let live = true
    let busy = false
    async function poll() {
      if (busy || document.visibilityState === 'hidden') return
      busy = true
      try {
        const page = await friendsApi.messages(id, latest.current ? { after: latest.current } : {})
        if (!live) return
        setLagging(false)
        if (page.messages.length > 0) {
          setMessages(current => mergeMessages(current, page.messages))
          if (hasFromThem(page.messages)) markRead()
        }
      } catch (e) {
        if (!live) return
        if (isNotFound(e)) setStatus('gone') // they removed you
        else setLagging(true)
      } finally {
        busy = false
      }
    }
    const timer = setInterval(() => void poll(), POLL_SECONDS.thread * 1000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [status, id, markRead])

  // New messages scroll into view when you were already at the bottom. Older ones keep your place.
  useLayoutEffect(() => {
    const el = log.current
    if (!el) return
    if (anchorHeight.current !== null) {
      el.scrollTop += el.scrollHeight - anchorHeight.current
      anchorHeight.current = null
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  function onScroll() {
    const el = log.current
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  async function loadOlder() {
    const first = messages[0]
    if (!first) return
    try {
      const page = await friendsApi.messages(id, { before: first.id })
      anchorHeight.current = log.current?.scrollHeight ?? null
      setMessages(current => mergeMessages(current, page.messages))
      setHasOlder(page.hasMore)
    } catch (e) {
      setSendError(messageOf(e))
    }
  }

  async function send(e?: FormEvent) {
    e?.preventDefault()
    if (!canSend(draft) || sending) return
    setSending(true)
    setSendError(null)
    try {
      const sent = await friendsApi.send(id, draft.trim())
      stickToBottom.current = true
      setMessages(current => mergeMessages(current, [sent]))
      setDraft('')
    } catch (err) {
      // The draft stays, so nothing you typed is lost.
      if (isNotFound(err)) setStatus('gone')
      else setSendError(messageOf(err))
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  if (status === 'loading' || status === 'error') {
    return <LoadState state={status === 'loading' ? { status } : { status, message: loadError }} reload={() => { setStatus('loading'); setAttempt(n => n + 1) }} what="the chat" />
  }
  if (status === 'gone') {
    return (
      <p className="notice error" role="alert">
        You are not friends with {name} any more, so you can't read or send messages. <Link to="/friends">Back to friends</Link>
      </p>
    )
  }

  const left = charsLeft(draft)
  return (
    <section className="panel chat" aria-label={`Chat with ${name}`}>
      <div className="chat-log" ref={log} role="log" aria-live="polite" onScroll={onScroll}>
        {hasOlder && <button type="button" className="link-btn" onClick={() => void loadOlder()}>Show older messages</button>}
        {messages.length === 0 && <p className="muted">No messages yet. Say hello, and pick a time to play.</p>}
        <ul className="chat-messages">
          {messages.map(m => (
            <li key={m.id} className={m.mine ? 'chat-msg mine' : 'chat-msg theirs'}>
              <span className="chat-who">{m.mine ? 'You' : name}</span>
              <p className="chat-text">{m.text}</p>
              <time dateTime={m.createdAt}>{when(m.createdAt)}</time>
            </li>
          ))}
        </ul>
      </div>
      {lagging && <p className="notice" role="status">Can't reach the server. Trying again…</p>}
      <form className="chat-form" onSubmit={e => void send(e)}>
        <textarea
          value={draft} rows={2} placeholder={`Message ${name}`} aria-label={`Message to ${name}`}
          maxLength={CHAT_LIMITS.maxLength * 2} onChange={e => setDraft(e.target.value)} onKeyDown={onKeyDown}
        />
        <button type="submit" className="account-btn primary" disabled={sending || !canSend(draft)}>Send</button>
      </form>
      <p className="chat-foot muted">
        Enter sends, Shift+Enter adds a line.
        {left <= COUNTER_FROM && (
          <span className={left < 0 ? 'chat-over' : undefined}> {left < 0 ? `${-left} characters too many` : `${left} characters left`}.</span>
        )}
      </p>
      {sendError && <p className="notice error" role="alert">{sendError}</p>}
    </section>
  )
}

export default function Chat({ auth, playerId }: { auth: Auth; playerId: string }) {
  const lists = useLoad(friendsApi.list, [playerId])
  const person = lists.state.status === 'ready' ? lists.state.data.friends.find(f => f.playerId === playerId) : undefined
  return (
    <Shell auth={auth}>
      <header>
        <p className="eyebrow"><Link to="/friends">Friends</Link> · {playerId}</p>
        <h1>{person ? `Chat with ${personName(person)}` : 'Chat'}</h1>
      </header>
      {lists.state.status !== 'ready'
        ? <LoadState state={lists.state} reload={lists.reload} what="your friends" />
        : person
          ? <ChatView key={person.playerId} person={person} />
          : <p className="notice error" role="alert">{playerId} is not one of your friends. <Link to="/friends">Back to friends</Link></p>}
    </Shell>
  )
}
