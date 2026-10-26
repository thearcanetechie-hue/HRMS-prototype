import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  createPublicKey,
  type JsonWebKey,
  randomBytes,
  timingSafeEqual,
  verify,
} from 'node:crypto';
import { requestContext } from '../common/request-context';
import type { Env } from '../config';
import { PolicyService } from '../policies/policies.module';
import { PrismaService } from '../prisma/prisma.service';

export type Provider = 'google' | 'microsoft';

interface ProviderConfig {
  authorize: string;
  token: string;
  jwks: string;
  /** Accepts the token's issuer. Microsoft issues per Azure tenant, so it's a pattern. */
  issuer: (iss: string) => boolean;
  clientId?: string;
  clientSecret?: string;
}

/** What travels in the short-lived, signed cookie between leaving and coming back. */
interface FlowState {
  provider: Provider;
  state: string;
  verifier: string;
  workspace: string;
  remember: boolean;
  exp: number;
}

const b64url = (b: Buffer) => b.toString('base64url');

/**
 * "Sign in with Google / Microsoft" (OpenID Connect authorization code flow with PKCE).
 *
 * Only signs in people who already have a login in the workspace: the provider's verified
 * email must match it. The first time, the provider account is linked by its stable subject id,
 * so a later email change at the provider still finds the same login. The ID token's signature
 * is checked against the provider's published keys, along with its issuer, audience, expiry
 * and nonce.
 */
@Injectable()
export class OAuthService {
  private jwksCache = new Map<string, { at: number; keys: JsonWebKey[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly policies: PolicyService,
  ) {}

  private providers(): Record<Provider, ProviderConfig> {
    return {
      google: {
        authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
        token: 'https://oauth2.googleapis.com/token',
        jwks: 'https://www.googleapis.com/oauth2/v3/certs',
        issuer: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
        clientId: this.config.get('GOOGLE_CLIENT_ID', { infer: true }),
        clientSecret: this.config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      },
      microsoft: {
        authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        jwks: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
        issuer: (iss) => /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/.test(iss),
        clientId: this.config.get('MICROSOFT_CLIENT_ID', { infer: true }),
        clientSecret: this.config.get('MICROSOFT_CLIENT_SECRET', { infer: true }),
      },
    };
  }

  /** Which buttons the sign-in page shows. */
  available() {
    const p = this.providers();
    return {
      google: Boolean(p.google.clientId && p.google.clientSecret),
      microsoft: Boolean(p.microsoft.clientId && p.microsoft.clientSecret),
    };
  }

  redirectUri(provider: Provider) {
    return `${this.config.get('APP_URL', { infer: true }).replace(/\/$/, '')}/api/auth/oauth/${provider}/callback`;
  }

  private sign(payload: string) {
    return createHmac('sha256', this.config.get('JWT_ACCESS_SECRET', { infer: true }))
      .update(`oauth:${payload}`)
      .digest('base64url');
  }

  /** Starts the flow: the URL to send the browser to, and the signed state cookie to set. */
  start(provider: Provider, workspace: string, remember: boolean) {
    const cfg = this.providers()[provider];
    if (!cfg.clientId || !cfg.clientSecret)
      throw new BadRequestException('This sign-in option isn’t set up');
    const flow: FlowState = {
      provider,
      state: b64url(randomBytes(24)),
      verifier: b64url(randomBytes(48)),
      workspace,
      remember,
      exp: Date.now() + 10 * 60_000,
    };
    const challenge = b64url(createHash('sha256').update(flow.verifier).digest());
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: this.redirectUri(provider),
      response_type: 'code',
      scope: 'openid email profile',
      state: flow.state,
      nonce: flow.state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    const body = b64url(Buffer.from(JSON.stringify(flow)));
    return { url: `${cfg.authorize}?${params}`, cookie: `${body}.${this.sign(body)}` };
  }

  /** Reads back the state cookie, refusing anything tampered with, expired or mismatched. */
  readFlow(cookie: string | undefined, provider: Provider, state: string | undefined): FlowState {
    const [body, mac] = (cookie ?? '').split('.');
    if (!body || !mac) throw new BadRequestException('Sign-in took too long. Try again.');
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given))
      throw new BadRequestException('Sign-in failed. Try again.');
    const flow = JSON.parse(Buffer.from(body, 'base64url').toString()) as FlowState;
    if (flow.provider !== provider || !state || flow.state !== state || flow.exp < Date.now())
      throw new BadRequestException('Sign-in took too long. Try again.');
    return flow;
  }

  /** Swaps the code for an ID token and returns the verified identity in it. */
  async identity(provider: Provider, code: string, flow: FlowState) {
    const cfg = this.providers()[provider];
    const res = await fetch(cfg.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(provider),
        client_id: cfg.clientId!,
        client_secret: cfg.clientSecret!,
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new BadRequestException('The sign-in provider refused the request');
    const { id_token } = (await res.json()) as { id_token?: string };
    if (!id_token) throw new BadRequestException('The sign-in provider sent no identity');
    const claims = await this.verifyIdToken(id_token, cfg, flow.state);
    const email = String(claims.email ?? claims.preferred_username ?? '').toLowerCase();
    // Google says whether the email is verified; Microsoft work accounts' emails are managed by
    // the organisation, so a missing flag there counts as verified.
    const verified =
      provider === 'google' ? claims.email_verified === true : claims.email_verified !== false;
    if (!email || !verified)
      throw new BadRequestException('Your account’s email isn’t verified with the provider');
    return { subject: String(claims.sub), email };
  }

  async verifyIdToken(
    token: string,
    cfg: Pick<ProviderConfig, 'jwks' | 'issuer' | 'clientId'>,
    nonce: string,
  ) {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) throw new BadRequestException('Bad identity token');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as {
      alg: string;
      kid: string;
    };
    if (header.alg !== 'RS256') throw new BadRequestException('Unexpected identity token');
    const jwk = (await this.keys(cfg.jwks)).find((k) => (k as { kid?: string }).kid === header.kid);
    if (!jwk) throw new BadRequestException('Unknown signing key');
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url')))
      throw new BadRequestException('The identity token’s signature is wrong');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>;
    const now = Date.now() / 1000;
    if (
      !cfg.issuer(String(claims.iss)) ||
      claims.aud !== cfg.clientId ||
      Number(claims.exp) < now - 60 ||
      claims.nonce !== nonce
    )
      throw new BadRequestException('The identity token isn’t valid for this app');
    return claims;
  }

  private async keys(url: string) {
    const cached = this.jwksCache.get(url);
    if (cached && Date.now() - cached.at < 3_600_000) return cached.keys;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const { keys } = (await res.json()) as { keys: JsonWebKey[] };
    this.jwksCache.set(url, { at: Date.now(), keys });
    return keys;
  }

  /** The login a provider identity belongs to in a workspace, linking it the first time. */
  async findLogin(
    workspace: string,
    provider: Provider,
    identity: { subject: string; email: string },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: workspace } });
    if (!tenant || tenant.status === 'SUSPENDED') return null;
    const store = requestContext.getStore();
    if (store) store.tenantId = tenant.id;
    if (!(await this.policies.get('security')).allowSso) return null;
    const linked = await this.prisma.externalIdentity.findUnique({
      where: {
        tenantId_provider_subject: { tenantId: tenant.id, provider, subject: identity.subject },
      },
      include: { user: true },
    });
    if (linked) return linked.user.status === 'ACTIVE' ? linked.user : null;
    const user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email: identity.email, status: 'ACTIVE' },
    });
    if (!user) return null;
    await this.prisma.externalIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        provider,
        subject: identity.subject,
        email: identity.email,
      },
    });
    // The provider has verified the email, so this login's email counts as verified too.
    if (!user.emailVerifiedAt)
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    return user;
  }
}
