'use client';

import {
  Copy,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  MailWarning,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import QRCode from 'qrcode';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { NewPasswordField } from '@/components/password-field';
import { Badge } from '@/components/ui/badge';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, FormError, Input } from '@/components/ui/input';
import { Banner, IconTile, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';

interface Account {
  email: string;
  emailVerified: boolean;
  passwordChangedAt: string | null;
  mfaEnabled: boolean;
  mfaRequired: boolean;
  recoveryCodesLeft: number;
  identities: { provider: string; email: string; createdAt: string }[];
  sessions: {
    id: string;
    device: string;
    ip: string | null;
    lastActiveAt: string;
    expiresAt: string;
    persistent: boolean;
    current: boolean;
  }[];
}

const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

export default function AccountSecurityPage() {
  const { me } = useSession();
  const [a, setA] = useState<Account | null>(null);
  const [dialog, setDialog] = useState<'password' | 'mfa' | 'disable' | 'codes' | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [toast, showToast] = useToast();
  const load = useCallback(() => {
    api<Account>('/auth/account')
      .then(setA)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  const done = (m: string) => {
    setDialog(null);
    showToast(m);
    load();
  };

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Sign-in and security"
        description="Your password, two-step sign-in and the devices you’re signed in on."
      />
      {!a ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {a.mfaRequired && !a.mfaEnabled && (
            <Banner className="xl:col-span-2">
              Your company requires two-step sign-in for your login. Turn it on below.
            </Banner>
          )}
          {!a.emailVerified && (
            <Card className="xl:col-span-2">
              <div className="flex flex-wrap items-center gap-3">
                <IconTile tone="warning">
                  <MailWarning />
                </IconTile>
                <div className="grow">
                  <div className="font-bold">Confirm your email</div>
                  <div className="text-[13px] text-muted-foreground">
                    We sent a link to {a.email}. Confirming it lets you reset your password if you
                    forget it.
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await api('/auth/verify-email/resend', { method: 'POST' });
                      showToast(`Sent a new link to ${a.email}`);
                    } catch (err) {
                      showToast(errorText(err, 'Could not send'));
                    }
                  }}
                >
                  Send it again
                </Button>
              </div>
            </Card>
          )}

          <Card className="content-start">
            <CardHeader>
              <div>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                  {a.passwordChangedAt
                    ? `Last changed ${formatDate(a.passwordChangedAt)}`
                    : 'Signed in with an invite or provider'}
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setDialog('password')}>
                Change password
              </Button>
            </CardHeader>
            {a.identities.length > 0 && (
              <ul className="grid gap-1 text-[13.5px] text-muted-foreground">
                {a.identities.map((i) => (
                  <li key={i.provider}>
                    Linked {i.provider === 'google' ? 'Google' : 'Microsoft'} account: {i.email}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="content-start">
            <CardHeader>
              <div>
                <CardTitle>Two-step sign-in</CardTitle>
                <CardDescription>
                  A code from an authenticator app (Google Authenticator, Microsoft Authenticator,
                  Authy) after your password
                </CardDescription>
              </div>
              {a.mfaEnabled ? (
                <Badge tone="success">On</Badge>
              ) : (
                <Badge tone={a.mfaRequired ? 'danger' : 'neutral'}>Off</Badge>
              )}
            </CardHeader>
            {a.mfaEnabled ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="grow text-[13.5px] text-muted-foreground">
                  {a.recoveryCodesLeft} recovery codes left
                </span>
                <Button size="sm" onClick={() => setDialog('codes')}>
                  <KeyRound /> New recovery codes
                </Button>
                {!a.mfaRequired && (
                  <Button size="sm" variant="ghost" onClick={() => setDialog('disable')}>
                    <ShieldOff /> Turn off
                  </Button>
                )}
              </div>
            ) : (
              <Button
                variant="primary"
                size="sm"
                className="justify-self-start"
                onClick={() => setDialog('mfa')}
              >
                <ShieldCheck /> Turn on two-step sign-in
              </Button>
            )}
          </Card>

          <Card className="content-start xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Where you’re signed in</CardTitle>
                <CardDescription>
                  Sign out anything you don’t recognise, then change your password
                </CardDescription>
              </div>
              {a.sessions.length > 1 && (
                <Button
                  size="sm"
                  onClick={async () => {
                    await api('/auth/sessions/revoke-others', { method: 'POST' });
                    done('Signed out everywhere else');
                  }}
                >
                  <LogOut /> Sign out other devices
                </Button>
              )}
            </CardHeader>
            <ul className="grid gap-2">
              {a.sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface-2/50 p-3"
                >
                  <IconTile size={36}>
                    <Laptop />
                  </IconTile>
                  <div className="min-w-0 grow">
                    <div className="font-semibold">
                      {s.device} {s.current && <Badge tone="success">This device</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.ip ? `${s.ip} · ` : ''}signed in{' '}
                      {new Date(s.lastActiveAt).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {s.persistent ? '' : ' · ends when the browser closes'}
                    </div>
                  </div>
                  {!s.current && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api(`/auth/sessions/${s.id}`, { method: 'DELETE' });
                        done(`Signed out ${s.device}`);
                      }}
                    >
                      Sign out
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && (setDialog(null), setCodes(null))}>
        {dialog === 'password' && (
          <PasswordDialog
            email={me.user.email}
            name={me.user.fullName}
            workspace={me.tenant.slug}
            onDone={done}
          />
        )}
        {dialog === 'mfa' &&
          (codes ? (
            <CodesDialog codes={codes} />
          ) : (
            <MfaSetupDialog
              onCodes={(c) => (setCodes(c), load(), showToast('Two-step sign-in is on'))}
            />
          ))}
        {dialog === 'disable' && <DisableDialog onDone={done} />}
        {dialog === 'codes' &&
          (codes ? (
            <CodesDialog codes={codes} />
          ) : (
            <NewCodesDialog onCodes={(c) => (setCodes(c), load())} />
          ))}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function PasswordDialog({
  email,
  name,
  workspace,
  onDone,
}: {
  email: string;
  name: string;
  workspace: string;
  onDone: (m: string) => void;
}) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent title="Change password" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/auth/password', {
              method: 'POST',
              body: JSON.stringify({ current, password }),
            });
            onDone('Password changed. Other devices were signed out.');
          } catch (err) {
            setError(errorText(err, 'Could not change it'));
            setBusy(false);
          }
        }}
      >
        <Field id="cur" label="Current password">
          <Input
            id="cur"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <NewPasswordField
          value={password}
          onChange={setPassword}
          context={{ email, name, workspace }}
        />
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Change password
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

function MfaSetupDialog({ onCodes }: { onCodes: (codes: string[]) => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qr: string } | null>(
    null,
  );
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup', { method: 'POST' })
      .then(async (s) =>
        setSetup({ ...s, qr: await QRCode.toDataURL(s.otpauthUrl, { margin: 1, width: 200 }) }),
      )
      .catch((err) => setError(errorText(err, 'Could not start')));
  }, []);
  return (
    <DialogContent title="Turn on two-step sign-in" aria-describedby={undefined}>
      {!setup ? (
        error ? (
          <FormError>{error}</FormError>
        ) : (
          <Skeleton className="h-60" />
        )
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            try {
              const r = await api<{ recoveryCodes: string[] }>('/auth/mfa/enable', {
                method: 'POST',
                body: JSON.stringify({ code }),
              });
              onCodes(r.recoveryCodes);
            } catch (err) {
              setError(errorText(err, 'That code didn’t work'));
            }
          }}
        >
          <ol className="grid list-decimal gap-1 pl-5 text-[13.5px] text-muted-foreground">
            <li>Open your authenticator app and add an account.</li>
            <li>Scan this code, or type the key below.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qr}
            alt="QR code for your authenticator app"
            className="size-[200px] justify-self-center rounded-xl bg-white p-2"
          />
          <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
            <code className="grow font-mono text-[13px] break-all">
              {setup.secret.match(/.{1,4}/g)?.join(' ')}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copy key"
              onClick={() => navigator.clipboard?.writeText(setup.secret)}
            >
              <Copy />
            </Button>
          </div>
          <Field id="mfa-code" label="Code from the app">
            <Input
              id="mfa-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="font-mono text-lg tracking-widest"
            />
          </Field>
          <FormError>{error}</FormError>
          <Button variant="primary" type="submit" disabled={code.length !== 6}>
            Turn on
          </Button>
        </form>
      )}
    </DialogContent>
  );
}

function CodesDialog({ codes }: { codes: string[] }) {
  return (
    <DialogContent title="Save your recovery codes" aria-describedby={undefined}>
      <div className="grid gap-4">
        <p className="text-[13.5px] text-muted-foreground">
          If you lose your phone, each code signs you in once. Keep them somewhere safe, like a
          password manager. They won’t be shown again.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2/60 p-4 font-mono text-[14px]">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex gap-3">
          <Button onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>
            <Copy /> Copy all
          </Button>
          <DialogClose asChild>
            <Button variant="primary">I’ve saved them</Button>
          </DialogClose>
        </div>
      </div>
    </DialogContent>
  );
}

function NewCodesDialog({ onCodes }: { onCodes: (codes: string[]) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  return (
    <DialogContent title="New recovery codes" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            onCodes(
              (
                await api<{ recoveryCodes: string[] }>('/auth/mfa/recovery-codes', {
                  method: 'POST',
                  body: JSON.stringify({ code }),
                })
              ).recoveryCodes,
            );
          } catch (err) {
            setError(errorText(err, 'That code didn’t work'));
          }
        }}
      >
        <p className="text-[13.5px] text-muted-foreground">
          Your old codes stop working. Enter a code from your app to continue.
        </p>
        <Field id="nc-code" label="Code from the app">
          <Input
            id="nc-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            className="font-mono"
          />
        </Field>
        <FormError>{error}</FormError>
        <Button variant="primary" type="submit" disabled={code.length !== 6}>
          Make new codes
        </Button>
      </form>
    </DialogContent>
  );
}

function DisableDialog({ onDone }: { onDone: (m: string) => void }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  return (
    <DialogContent title="Turn off two-step sign-in" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/auth/mfa/disable', {
              method: 'POST',
              body: JSON.stringify({ password, code }),
            });
            onDone('Two-step sign-in is off');
          } catch (err) {
            setError(errorText(err, 'Could not turn it off'));
          }
        }}
      >
        <Field id="dis-pw" label="Password">
          <Input
            id="dis-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field id="dis-code" label="Code from the app, or a recovery code">
          <Input
            id="dis-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono"
          />
        </Field>
        <FormError>{error}</FormError>
        <Button variant="danger" type="submit">
          Turn off
        </Button>
      </form>
    </DialogContent>
  );
}
