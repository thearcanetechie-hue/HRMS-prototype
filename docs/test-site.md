# Test site on Render

A hosted copy for trying the app from anywhere. It uses `render.yaml` at the repo root:

| Piece    | Render service                                             | Plan                                                 |
| -------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Database | `hrms-test-db` (PostgreSQL, Singapore)                     | basic-256mb                                          |
| API      | `hrms-test-api` (Node, Singapore, 1 GB disk for documents) | starter                                              |
| Website  | `hrms-test-web` (Node, Singapore)                          | free (sleeps when idle; first visit takes ~1 minute) |

Singapore is Render's closest region to India. Move to an Indian region (for example AWS Mumbai)
before real employee data goes in, so personal data stays in India.

## One-time setup

1. **Email (Resend).** Sign up at https://resend.com, open **API Keys → Create API key**
   (permission: Sending access) and copy the key. Until you verify your own domain, Resend only
   delivers to the email you signed up with.
2. **Render.** Sign up at https://render.com with GitHub, and allow it access to this repository.
3. **Billing.** In Render, **Account settings → Billing**: add a card (the API and database are
   paid plans).
4. **Blueprint.** **New → Blueprint**, pick this repository and branch `main`, name it
   `hrms-test`. Render reads `render.yaml` and asks for `EMAIL_API_KEY`: paste the Resend key.
   Click **Deploy Blueprint**.
5. **Wait** for all three services to show **Live** (the first build takes several minutes).
6. **Check the web address.** Open `hrms-test-web` and copy its URL. If it isn't
   `https://hrms-test-web.onrender.com`, open `hrms-test-api → Environment`, set `APP_URL` and
   `WEB_ORIGIN` to the real URL, and save (the API redeploys).
7. **Back up the encryption key.** `hrms-test-api → Environment → DATA_ENCRYPTION_KEY`: copy it into
   a password manager. Without it, encrypted PAN and bank details can't be read.

## Signing in

The demo workspace is created on first boot: workspace `demo`, `owner@demo.test` /
`DemoPass123`. Anyone with the link can use those demo logins, so keep real data out of `demo`;
sign up a separate workspace for your own data, and turn on two-step sign-in for it.

## Updating

Every push to `main` redeploys automatically. Migrations run on each start.
