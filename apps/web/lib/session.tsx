'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, Me, refreshSession, setAccessToken } from './api';

interface Session {
  me: Me;
  can: (permission: string) => boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <RequireSession>');
  return session;
}

/** Restores the session from the refresh cookie, or sends the visitor to /login. */
export function RequireSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await refreshSession())) throw new Error('signed out');
        const data = await api<Me>('/auth/me');
        if (!cancelled) setMe(data);
      } catch {
        if (!cancelled) router.replace('/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    router.replace('/login');
  }, [router]);

  const value = useMemo<Session | null>(() => {
    if (!me) return null;
    const permissions = new Set(me.user.permissions);
    return { me, can: (p) => permissions.has(p), signOut };
  }, [me, signOut]);

  if (!value) {
    return (
      <div className="empty" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        Loading your workspace…
      </div>
    );
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
