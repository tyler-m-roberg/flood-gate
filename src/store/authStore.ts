import { create } from 'zustand'
import type { UserProfile, Role } from '@/types'

// Mock users — in production this comes from Keycloak OIDC token
const MOCK_USERS: UserProfile[] = [
  {
    id: 'u-001',
    name: 'Dr. Alex Nguyen',
    email: 'alex.nguyen@lab.internal',
    roles: ['admin', 'analyst'],
    groups: ['structural', 'composites'],
    avatarInitials: 'AN',
  },
  {
    id: 'u-002',
    name: 'Sam Rivera',
    email: 'sam.rivera@lab.internal',
    roles: ['analyst'],
    groups: ['structural'],
    avatarInitials: 'SR',
  },
  {
    id: 'u-003',
    name: 'Chris Park',
    email: 'chris.park@lab.internal',
    roles: ['viewer'],
    groups: ['management'],
    avatarInitials: 'CP',
  },
]

interface AuthState {
  user: UserProfile | null
  isAuthenticated: boolean
  isLoading: boolean

  login(userId: string): void
  logout(): void
  hasRole(role: Role): boolean
  hasGroup(group: string): boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: MOCK_USERS[0],   // auto-login as admin for prototype
  isAuthenticated: true,
  isLoading: false,

  login(userId) {
    const user = MOCK_USERS.find(u => u.id === userId) ?? MOCK_USERS[0]
    set({ user, isAuthenticated: true })
  },

  logout() {
    set({ user: null, isAuthenticated: false })
  },

  hasRole(role) {
    return get().user?.roles.includes(role) ?? false
  },

  hasGroup(group) {
    return get().user?.groups.includes(group) ?? false
  },
}))

export { MOCK_USERS }
