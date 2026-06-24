export type UserRole = 'Admin' | 'Manager' | 'Inspector' | 'Technician' | 'Analyst' | 'Viewer';
export interface AuthUser { readonly id: string; readonly email: string; readonly fullName: string; readonly role: UserRole; readonly mustChangePassword: boolean }
export interface AuthTokens { readonly accessToken: string; readonly refreshToken: string }
export interface AuthSession { readonly user: AuthUser; readonly tokens: AuthTokens }
