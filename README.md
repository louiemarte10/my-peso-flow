# myPesoFlow

A personal earnings and expense tracker. Everything is encoded manually — what
you type is exactly what it reports — and the dashboard rolls it up by day,
last 7 days, month and year.

Built with the same stack as amarah-buko-juice: **Next.js 16 (App Router) +
Prisma 7 + Neon Postgres + Tailwind 4**.

---

## Features

- **Sign in** with email + password, or with Google (optional, allow-listed).
  Open sign-up at `/signup` (turn it off with `ALLOW_SIGNUP=false`).
- **People** (admin only) - create accounts for other people, edit them, reset
  passwords, enable/disable, and **Log in as** someone to encode on their
  behalf with a banner and a one-click way back. **View books** is a read-only
  summary of one person's figures.
- **Archived** - archiving is the default instead of deleting. Archived rows
  count towards nothing and wait on the Archived page until you **Restore** or
  **Delete forever**.
- **Dashboard** — today / last 7 days / this month / this year, each showing
  earnings, expenses and balance, plus all-time running balance and a strip of
  wallet balances. The chart switches between 7-day, month and year, and steps
  back through past periods.
- **My Wallets** — one card per place money sits (Security Bank, GoTyme, GCash,
  cash on hand). Balances are *derived*, never typed: opening balance + money in
  − money out. Each wallet shows its 30-day spend rate, roughly how many days
  the balance lasts, and flags itself when it drops below the mark you set.
  Open a wallet for its full ledger with a running balance after every movement.
- **Move money / Withdraw** — ATM withdrawals, bank-to-GCash cash-ins, setting
  money aside. Transfers move money between your own wallets without touching
  your earnings or expense totals; the fee box captures what the move itself
  cost, and that is treated as real money gone.
- **Earnings** — encode salary, freelance, business or bonus against the date
  it was received.
- **Expenses** — same, for money going out.
- **All Transactions** — the full ledger grouped by day, filterable by range,
  type and search text, with CSV export.
- **Categories** — your own sources and categories, each with a colour that
  carries into the dashboard breakdown.
- **Light and dark theme** — `#0078BF` in light, `#55A5D4` in dark, remembered
  per device and applied before first paint (no flash).

## Conventions worth knowing

| Thing | How it works |
| --- | --- |
| Money | Stored as integer **centavos**. `lib/money.ts` converts to/from pesos. No rounding drift. |
| Wallet balances | Never stored. `lib/wallets.ts` recomputes them from entries + transfers on every read, so editing old rows self-corrects. |
| Transfers | Moves between your own wallets. Never counted as income or expense; `feeCents` is, since it really leaves the source wallet. |
| Dates | A day is a **Manila** calendar day (UTC+8). `lib/date.ts` converts between `"YYYY-MM-DD"` and UTC instants. |
| Auth | A signed JWT in an httpOnly cookie (`jose`). `proxy.ts` guards pages; API routes check the session themselves. |
| Data scope | Every query is filtered by `userId`, so accounts never see each other's ledger. |
| Middleware | This project uses `proxy.ts` (Next 16 naming), not `middleware.ts`. |
| Archiving | `archivedAt` timestamp, never a hard delete. **Every query feeding a number must carry `LIVE` from `lib/archive.ts`** - miss one and a balance silently disagrees with its own ledger. |
| Roles | Read from the database per request, never from the session cookie, so promoting or disabling someone takes effect immediately. |
| Impersonation | The session's `act` claim holds the real admin. An impersonated session is never treated as admin. |

## Setup

```bash
npm install          # also runs `prisma generate`
cp .env.example .env # then fill it in
npm run db:push      # create the tables in Neon
npm run db:seed      # create your account + starter categories and wallets
npm run dev          # http://localhost:3000
```

### Environment

See `.env.example` for the full list. The essentials:

- `DATABASE_URL` — Neon **pooled** connection (host contains `-pooler`).
- `DIRECT_URL` — Neon **direct** connection, used for migrations.
- `SESSION_SECRET` — generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

Google sign-in is optional. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
`APP_URL`, and add `<APP_URL>/api/auth/google/callback` as an authorised
redirect URI in the Google Cloud console. Leave the credentials blank and the
button simply doesn't appear. `ALLOWED_EMAILS` restricts which Google accounts
may sign in — keep it set for a personal ledger.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | `prisma generate` then `next build` |
| `npm run db:push` | Push the schema to Neon (no migration files) |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:studio` | Browse the data in Prisma Studio |
| `npm run db:seed` | Create the first account + starter categories and wallets |
| `npm run lint` | ESLint |

## Deploying to Vercel

1. Import the repo at <https://vercel.com/new>.
2. Add `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET` and — if you want Google
   sign-in — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, and
   `APP_URL` set to the deployed URL. Set `ALLOW_SIGNUP=false` if you do not
   want strangers creating their own accounts on a public URL.
3. Add `https://<your-app>.vercel.app/api/auth/google/callback` to the Google
   OAuth client's authorised redirect URIs.
4. Deploy, then run `npm run db:push` once against the same database.

## Project layout

```
app/
  (app)/            pages behind the login (dashboard, wallets, earnings, …)
  api/              route handlers (auth, entries, categories, wallets,
                    transfers, dashboard, me)
  login/            sign-in page
components/         AppShell, EntryManager, FlowChart, StatCard, …
lib/                db, auth, session, google, money, date, wallets, client
prisma/             schema.prisma + seed.ts
proxy.ts            route protection
```
