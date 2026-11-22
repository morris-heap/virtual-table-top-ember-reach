// Landing page for signed-out visitors (VTTER-59). Copy follows README.md (pitch and design pillars).
import type { CSSProperties, ReactNode } from 'react'
import core from '../../data/core.json'
import { socialProviders } from './auth/config.ts'
import type { SocialProvider } from './auth/oauth.ts'
import type { Auth } from './auth/useAuth.ts'
import { DEGREE_HINT, DEGREE_LABEL, degreeOf } from './engine/dice.ts'

// The sample Test on the hero card, scored by the real engine so it always matches the rules and /data.
const SAMPLE = (() => {
  const natural = 17, wits = 3, notice = 1
  const dc = core.difficulties.find(d => d.dc === 16) ?? core.difficulties[2]
  const total = natural + wits + notice
  const degree = degreeOf(natural, total, dc.dc)
  return { natural, wits, notice, dc, total, degree, margin: total - dc.dc }
})()

export function Logo({ size = 32 }: { size?: number }) {
  // An ember inside a twenty-sided die silhouette.
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ember-fill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#d9531e" />
          <stop offset="1" stopColor="#ffb347" />
        </linearGradient>
      </defs>
      <path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 15c3 7 11 11 11 21a11 11 0 0 1-22 0c0-5 3-8 5-10 0 4 2 6 4 6-1-6 0-12 2-17Z" fill="url(#ember-fill)" />
    </svg>
  )
}

// Provider marks for the social sign-in buttons (each company's own logo colors).
const PROVIDER_ICON: Record<SocialProvider, ReactNode> = {
  Google: (
    <>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1a7 7 0 0 1-6.6-4.8h-4v3.1A12 12 0 0 0 12 24" />
      <path fill="#FBBC05" d="M5.4 14.4a7 7 0 0 1 0-4.6V6.7h-4a12 12 0 0 0 0 10.8z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1A7 7 0 0 1 12 4.8" />
    </>
  ),
  Microsoft: (
    <>
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </>
  ),
  GitHub: (
    <path fill="#1f2328" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2 0 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8 0 3.2.9.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1 .9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
  ),
}

function SocialButtons({ auth }: { auth: Auth }) {
  if (socialProviders.length === 0) return null
  return (
    <div className="lp-social" role="group" aria-label="Continue with another account">
      <span className="lp-or">or continue with</span>
      <div className="lp-social-row">
        {socialProviders.map(p => (
          <button key={p} type="button" className="lp-social-btn" onClick={() => auth.signInWith(p)}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">{PROVIDER_ICON[p]}</svg>
            <span>{p}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const PILLARS = [
  {
    title: 'One roll for everything',
    body: 'd20 + Attribute + Skill against a fixed DC. New players are rolling dice within fifteen minutes.',
    icon: <path d="M12 2 21 7v10l-9 5-9-5V7Zm0 5-4.5 7.5h9Z" />,
  },
  {
    title: 'Players roll every die',
    body: 'The GM never rolls in combat. Heroes roll to hit and to dodge, so every roll is a player’s moment.',
    icon: <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm1.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />,
  },
  {
    title: 'Fail forward',
    body: 'Miss by a hair and you succeed at a cost. The story keeps moving, and “nothing happens” is rare.',
    icon: <path d="M4 12h12.2l-4.6-4.6L13 6l7 6-7 6-1.4-1.4 4.6-4.6H4Z" />,
  },
  {
    title: 'Your heroes, on every device',
    body: 'Sign in and your saved heroes follow you from your laptop at home to your phone at the table.',
    icon: <path d="M12 2a5 5 0 0 1 5 5v2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v2h6V7a3 3 0 0 0-3-3Z" />,
  },
]

/** "Google", "Google or Microsoft", "Google, Microsoft or GitHub". */
function listOr(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

export default function Landing({ auth, onGuest }: { auth: Auth; onGuest: () => void }) {
  const error = auth.state.status === 'signedOut' ? auth.state.error : undefined

  return (
    <div className="landing">
      <header className="lp-nav">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Emberreach home">
          <Logo size={30} />
          <span>Emberreach</span>
        </a>
        <button type="button" className="lp-btn ghost small" onClick={auth.signIn}>Sign in</button>
      </header>

      <section className="lp-hero" aria-labelledby="lp-title">
        <div className="embers" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => <span key={i} style={{ '--i': i } as CSSProperties} />)}
        </div>
        <div className="lp-hero-inner">
          <div className="lp-copy">
            <p className="lp-eyebrow">A fantasy tabletop RPG · Rules v{core.version}</p>
            <h1 id="lp-title">Carry light into the Reach.</h1>
            <p className="lp-lead">
              A hundred years ago the Sun Forge cracked. Now embers fall from the sky, and wherever one lands it can
              grow into a town’s hearth or a monster’s heart. Gather three to five friends, build your Ember-bearers,
              and bring treasure back from the dark.
            </p>

            {error && <p className="lp-alert" role="alert">{error}</p>}

            <div className="lp-ctas">
              <button type="button" className="lp-btn primary" onClick={auth.signUp}>Create free account</button>
              <button type="button" className="lp-btn secondary" onClick={auth.signIn}>Sign in</button>
            </div>
            <SocialButtons auth={auth} />
            <p className="lp-fine">
              Free while the game is in development. Sign in with your email address
              {socialProviders.length > 0 && ` or your ${listOr(socialProviders)} account`}.
            </p>
            <button type="button" className="lp-link" onClick={onGuest}>
              Just want to roll? Try the Test roller without an account <span aria-hidden="true">→</span>
            </button>
          </div>

          <figure
            className="lp-card"
            aria-label={`Example Test: ${SAMPLE.total} against DC ${SAMPLE.dc.dc}, ${DEGREE_LABEL[SAMPLE.degree]}`}
          >
            <div className="lp-card-head">
              <span>Test · Notice</span>
              <span className="lp-dc">DC {SAMPLE.dc.dc} · {SAMPLE.dc.name}</span>
            </div>
            <div className="lp-card-roll">
              <div className="lp-die" aria-hidden="true">{SAMPLE.natural}</div>
              <div>
                <div className="lp-total">{SAMPLE.total}</div>
                <div className="lp-math">d20 {SAMPLE.natural} + Wits {SAMPLE.wits} + Notice {SAMPLE.notice}</div>
              </div>
            </div>
            <div className={`lp-card-result ${SAMPLE.degree}`}>
              <b>{DEGREE_LABEL[SAMPLE.degree]}</b>
              <span>Beat the DC by {SAMPLE.margin}. {DEGREE_HINT[SAMPLE.degree]}</span>
            </div>
            <div className="lp-pips" aria-hidden="true">
              {Array.from({ length: core.momentum.max }, (_, i) => <span key={i} className={i < 3 ? 'on' : ''} />)}
            </div>
            <figcaption>Party Momentum</figcaption>
          </figure>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="lp-pillars">
        <p className="lp-eyebrow">Built for the table</p>
        <h2 id="lp-pillars">Fast to learn, deep to master</h2>
        <div className="lp-grid">
          {PILLARS.map(p => (
            <article key={p.title} className="lp-feature">
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">{p.icon}</svg>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-companion" aria-labelledby="lp-app">
        <div>
          <p className="lp-eyebrow">The companion app</p>
          <h2 id="lp-app">Everything you need at the table</h2>
          <ul className="lp-list">
            <li><b>Test roller.</b> Boons and Banes, every DC, and the degree of result spelled out.</li>
            <li><b>Party Momentum.</b> Track the shared pool and spend it in a tap.</li>
            <li><b>Saved heroes.</b> Your characters, kept safe in your account.</li>
            <li><b>Character sheets.</b> Guided hero creation is coming soon.</li>
          </ul>
        </div>
        <div className="lp-cta-box">
          <h3>Ready to light the first ember?</h3>
          <button type="button" className="lp-btn primary" onClick={auth.signUp}>Create free account</button>
          <button type="button" className="lp-btn secondary" onClick={auth.signIn}>I already have an account</button>
        </div>
      </section>

      <p className="lp-trust">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Zm-1 13.4-3.7-3.7 1.4-1.4 2.3 2.3 4.9-4.9 1.4 1.4Z" />
        </svg>
        Secure sign-in by Amazon Cognito. Your password never reaches Emberreach servers.
      </p>

      <footer className="lp-footer">
        <span>Emberreach (working title) · Rules v{core.version}</span>
        <a href="https://github.com/morris-heap/virtual-table-top-ember-reach">GitHub</a>
      </footer>
    </div>
  )
}
