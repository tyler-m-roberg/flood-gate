import { create } from 'zustand'
import type { UserProfile, Role } from '@/types'

interface AuthConfig {
  loginUrl: string
  logoutUrl: string
}

interface AuthState {
  user: UserProfile | null
  isAuthenticated: boolean
  isLoading: boolean
  authConfig: AuthConfig | null

  /** Check auth status via BFF /auth/me endpoint. Redirects to login if unauthenticated. */
  init(): Promise<void>
  logout(): void
  hasRole(role: Role): boolean
  hasGroup(group: string): boolean
}

interface MeResponse {
  authenticated: boolean
  subject?: string
  username?: string
  email?: string
  name?: string
  roles?: string[]
  groups?: string[]
}

function buildUserProfile(me: MeResponse): UserProfile {
  const roles = (me.roles ?? []).filter(
    (r): r is Role => r === 'admin' || r === 'analyst' || r === 'viewer',
  )

  const groups = (me.groups ?? []).map(g =>
    g.startsWith('/') ? g.slice(1) : g,
  )

  const name = me.name || me.username || me.subject || 'Unknown'
  const parts = name.split(' ')
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase()

  return {
    id: me.subject!,
    name,
    email: me.email ?? '',
    roles: roles.length > 0 ? roles : ['viewer'],
    groups,
    avatarInitials: initials,
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  authConfig: null,

  async init() {
    set({ isLoading: true })
    try {
      // Fetch auth config (Keycloak URLs, login endpoint)
      const configRes = await fetch('/api/v1/auth/config', { credentials: 'include' })
      const config = configRes.ok ? await configRes.json() : null

      if (config) {
        set({
          authConfig: {
            loginUrl: config.login_url,
            logoutUrl: config.logout_url,
          },
        })
      }

      // Check current authentication status
      const meRes = await fetch('/api/v1/auth/me', { credentials: 'include' })
      if (meRes.ok) {
        const me: MeResponse = await meRes.json()
        if (me.authenticated) {
          set({ user: buildUserProfile(me), isAuthenticated: true, isLoading: false })
          return
        }
      }

      // Not authenticated — redirect to BFF login
      const currentPath = window.location.pathname + window.location.search
      const loginUrl = config?.login_url ?? '/api/v1/auth/login'
      window.location.href = `${loginUrl}?redirect_uri=${encodeURIComponent(currentPath)}`
    } catch (err) {
      console.error('Auth init failed:', err)
      // On error, try redirecting to login anyway
      window.location.href = '/api/v1/auth/login'
    }
  },

  logout() {
    const config = get().authConfig
    // POST to logout endpoint (clears cookie, redirects to Keycloak logout)
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = config?.logoutUrl ?? '/api/v1/auth/logout'
    document.body.appendChild(form)
    form.submit()
  },

  hasRole(role) {
    return get().user?.roles.includes(role) ?? false
  },

  hasGroup(group) {
    return get().user?.groups.includes(group) ?? false
  },
}))
