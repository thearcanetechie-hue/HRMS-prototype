'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';
import { api, ApiError, Employee } from '@/lib/api';

/**
 * Invites an employee to sign in and shows the one-time link to share with them.
 * (Email delivery is a later step; until then HR copies the link.)
 */
export function InviteButton({
  employee,
  onInvited,
}: {
  employee: Employee;
  onInvited?: () => void;
}) {
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = employee.user?.status;

  if (status === 'ACTIVE') return <span className="pill good">Can sign in</span>;
  if (employee.status === 'EXITED') return <span className="muted">–</span>;

  async function invite() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ inviteUrl: string; expiresAt: string }>(
        `/employees/${employee.id}/invite`,
        {
          method: 'POST',
        },
      );
      setLink({ url: res.inviteUrl, expiresAt: res.expiresAt });
      onInvited?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the invite.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-sm" onClick={invite} disabled={busy}>
        <Icon name="send" size={14} /> {status === 'INVITED' ? 'Resend invite' : 'Invite'}
      </button>
      {error && <div className="err">{error}</div>}
      {link && (
        <div
          className="scrim"
          style={{ alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => e.target === e.currentTarget && setLink(null)}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            style={{ width: 'min(520px, calc(100vw - 32px))' }}
          >
            <div className="card-h">
              <h3 id="invite-title">Invite link for {employee.firstName}</h3>
              <button className="btn icon-btn" aria-label="Close" onClick={() => setLink(null)}>
                <Icon name="x" />
              </button>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Send this link to {employee.workEmail}. It works once and expires on{' '}
              {new Date(link.expiresAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              })}
              . Any earlier link for them no longer works.
            </p>
            <input
              className="input num"
              readOnly
              value={link.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invite link"
            />
            <div className="actions" style={{ marginTop: 14 }}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(link.url).catch(() => undefined);
                  setCopied(true);
                }}
              >
                <Icon name="check" size={16} /> {copied ? 'Copied' : 'Copy link'}
              </button>
              <button className="btn" onClick={() => setLink(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
