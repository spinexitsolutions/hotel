import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission, type Permission } from '@aurelle/shared';
import { get, post } from '@/lib/api';
import type { AuthUser } from '@/lib/types';

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (data: { name: string; email: string; phone: string; password: string; marketingOptIn: boolean }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  can: (p: Permission) => boolean;
  refresh: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['me'], queryFn: () => get<{ user: AuthUser | null }>('/auth/me'), staleTime: 60_000 });
  const user = data?.user ?? null;

  const value: AuthCtx = {
    user,
    loading: isLoading,
    async login(email, password) {
      const res = await post<{ user: AuthUser }>('/auth/login', { email, password });
      qc.setQueryData(['me'], res);
      return res.user;
    },
    async register(d) {
      const res = await post<{ user: AuthUser }>('/auth/register', d);
      qc.setQueryData(['me'], res);
      return res.user;
    },
    async logout() {
      await post('/auth/logout');
      qc.clear();
      qc.setQueryData(['me'], { user: null });
    },
    can: (p) => !!user && (user.permissions.includes('*') || hasPermission(user, p)),
    refresh: () => void refetch(),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
