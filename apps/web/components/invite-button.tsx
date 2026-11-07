'use client';

import { useState } from 'react';
import { Check, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

  if (status === 'ACTIVE') return <Badge tone="success">Can sign in</Badge>;
  if (employee.status === 'EXITED') return <span className="text-muted-foreground">–</span>;

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
      <Button size="sm" onClick={invite} disabled={busy}>
        <Send /> {status === 'INVITED' ? 'Resend invite' : 'Invite'}
      </Button>
      {error && <p className="mt-1 text-xs font-semibold text-danger">{error}</p>}
      <Dialog open={Boolean(link)} onOpenChange={(open) => !open && setLink(null)}>
        {link && (
          <DialogContent title={`Invite link for ${employee.firstName}`}>
            <DialogDescription className="mb-4 text-muted-foreground">
              Send this link to {employee.workEmail}. It works once and expires on{' '}
              {new Date(link.expiresAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              })}
              . Any earlier link for them no longer works.
            </DialogDescription>
            <Input
              className="font-mono text-[13px]"
              readOnly
              value={link.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invite link"
            />
            <div className="mt-5 flex gap-3">
              <Button
                variant="primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(link.url).catch(() => undefined);
                  setCopied(true);
                }}
              >
                <Check /> {copied ? 'Copied' : 'Copy link'}
              </Button>
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
