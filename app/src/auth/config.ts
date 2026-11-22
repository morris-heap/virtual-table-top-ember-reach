// Public sign-in settings from Vite env (app/.env.production, app/.env.development). None of these are secrets:
// the app client is public and uses PKCE. Sign-in is hidden until VITE_AUTH_DOMAIN and VITE_AUTH_CLIENT_ID are set.
import { parseProviders, type AuthConfig, type SocialProvider } from './oauth.ts'

const domain = import.meta.env.VITE_AUTH_DOMAIN?.trim()
const clientId = import.meta.env.VITE_AUTH_CLIENT_ID?.trim()

export const authConfig: AuthConfig | null = domain && clientId
  ? { domain, clientId, redirectUri: new URL(import.meta.env.BASE_URL, window.location.origin).href }
  : null

/**
 * Social providers turned on in the EmberreachAuth stack (VITE_AUTH_PROVIDERS, e.g. "Google,Microsoft,GitHub").
 * The landing page shows a button for each. List only providers that are deployed: an unknown one makes Cognito
 * show an error page.
 */
export const socialProviders: SocialProvider[] = authConfig ? parseProviders(import.meta.env.VITE_AUTH_PROVIDERS) : []

/** Emberreach API base URL (EmberreachApi output ApiUrl), or null if not configured. */
export const apiUrl: string | null = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') || null
