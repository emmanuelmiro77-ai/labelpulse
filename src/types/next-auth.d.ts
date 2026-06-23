import "next-auth"

declare module "next-auth" {
  interface Session {
    accessToken?: string
    isBetaCode?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    isBetaCode?: boolean
    id?: string
  }
}
