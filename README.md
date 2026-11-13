<!-- readme-refresh 2026-11 -->
<div align="center">

# 🥛 Dairy Collection Manager

**Daily milk collection register, rate charts and supplier ledger**

<img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" /> <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" /> <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" /> <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" /> <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />

</div>

## ✨ Highlights

- Daily milk collection register and supplier rate charts
- Per-supplier ledger with advances and EMI recovery
- Single owner login; runs on free tiers

<!-- body -->
Daily milk collection register, supplier rate charts, per-supplier ledger, advances with EMI recovery.
React + Vite on Vercel, Supabase (PostgreSQL + Auth) for data and the single owner login. Free tiers, no card.

## 1. Set up Supabase (once)

1. Sign up at https://supabase.com (GitHub login works, no card) → **New project**.
   Pick a region near you (e.g. *Mumbai / ap-south-1*) and save the database password somewhere safe.
2. **SQL Editor** → New query → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   This creates the tables, the owner-only access rules and the settlement functions.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up"
   (and "Confirm email" can stay off). Save.
4. **Authentication → Users → Add user → Create new user**: the owner's email and password,
   with *Auto Confirm User* ticked.
5. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

## 2. Run locally

```
npm install
cp .env.example .env.local   # then paste the Project URL and anon key into it
npm start                    # http://localhost:5173
```

Local and deployed copies use the same Supabase database.

## 3. Deploy on Vercel

Import the GitHub repo in Vercel (it detects Vite), add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
under *Settings → Environment Variables*, and deploy. `vercel.json` makes refreshes on `/ledger/...` work.

The anon key is safe to ship in the browser: without signing in as the owner, the database's
row-level security rules return nothing and reject every write.

Free Supabase projects pause after 7 days with no activity; daily use keeps it awake, and a paused
project is restored with one click in the dashboard.

## How the numbers work

- **Quantity** = liters + ml / 1000. **Amount** = quantity × rate, rounded to paise (computed by the database).
- **Rate** comes from the supplier's chart. A fat % between two chart rows is interpolated; below or above the chart it uses the nearest end and says so. Rates can be typed in manually (marked `m`).
- **Ledger balance** = milk credited − cash paid (advances + settlement payouts).
  `Cr` means the unit owes the supplier; `Dr` means the supplier still owes on an advance.
- **Settlement** (Ledger page) covers every unsettled entry in the chosen date range, in one database transaction.
  It deducts EMI (each open advance's EMI oldest first, then any extra to the oldest; capped at the milk amount
  and the outstanding advance), records the net payout and reduces the advance balance.
  Settled entries are locked; reversing the settlement unlocks them and returns the EMI to the advances.
- An advance can be deleted only before any EMI has been taken from it.

---

<div align="center"><sub>Built by <a href="https://github.com/Mokshitsharma">Mokshit Sharma</a> · <a href="https://mokshitsharma27.vercel.app/">Portfolio</a> · <a href="https://www.linkedin.com/in/mokshit-sharma-75b5ab305">LinkedIn</a></sub></div>
