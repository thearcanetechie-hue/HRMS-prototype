# Integrations

Set up under **Integrations** by anyone with the `integrations.manage` permission (owners and HR
admins by default).

## Slack and Microsoft Teams

Paste an incoming-webhook address for a channel and pick the events to post. Slack gets a short
message; Teams gets an adaptive card. Each message has an "Open HRMS" link (`APP_URL`).

## Webhooks (Zapier, Make, n8n, your own server)

Every picked event is sent as a `POST` with a JSON body:

```json
{
  "id": "…",
  "event": "leave.approved",
  "description": "Leave is approved",
  "summary": "Asha Rao approved Priya Nair’s leave",
  "occurredAt": "2026-11-08T09:30:00.000Z",
  "workspace": { "slug": "demo", "name": "Demo Industries Pvt Ltd" },
  "entity": { "type": "LeaveRequest", "id": "…" },
  "data": {}
}
```

Headers: `X-HRMS-Event`, `X-HRMS-Delivery` and `X-HRMS-Signature: t=<unix seconds>,v1=<hex>`,
where `v1` is HMAC-SHA256 of `<t>.<raw body>` with the signing secret shown when the webhook was
added. Reject requests whose signature doesn't match or whose `t` is more than 5 minutes old.

```js
const [, t, v1] = /t=(\d+),v1=([a-f0-9]+)/.exec(req.headers['x-hrms-signature']);
const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
```

Anything other than a 2xx answer is retried after 1 minute, 5 minutes, 30 minutes, 2 hours and
12 hours, then marked failed. In production, addresses must be `https://` and can't point at
private or internal networks.

## API keys

Send a key as `Authorization: Bearer hrms_…` to any API route. A key acts as the person who made
it, with only the permissions picked, and loses any permission that person loses. Keys can't call
sign-in, password, two-step or API-key routes. Revoking a key stops it at once.
