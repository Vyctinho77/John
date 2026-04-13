export interface CodexTokens {
  accessToken: string
  refreshToken: string
  idToken: string
  accountId: string
  expires: number    // timestamp ms
  planType: string   // 'plus' | 'pro' | 'team'
  email: string
}

export interface AuthStatus {
  authenticated: boolean
  email?: string
  planType?: string
  expiresAt?: number
}
