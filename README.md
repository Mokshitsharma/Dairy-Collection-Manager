# Dairy Collection Manager

Daily milk collection register, supplier rate charts, per-supplier ledger, advances with EMI recovery.
React + Vite, Firebase Auth + Firestore. Single owner login.

## Run locally (no Firebase account needed)

```
npm install
npm start            # Auth + Firestore emulators and the app on http://localhost:5173
npm run local-user   # once, in another terminal: creates admin@dairy.local / dairy123
```

Local data is saved to `.emulator-data/` when you stop with Ctrl+C and reloaded on the next start.
On a phone on the same Wi-Fi, open `http://<this-PC's-IP>:5173`.

## Deploy to Vercel

1. **Create the Firebase project** at https://console.firebase.google.com (the free Spark plan is enough).
   - *Build > Firestore Database* → Create database (production mode, pick a region near you, e.g. `asia-south1`).
   - *Build > Authentication* → Get started → enable **Email/Password**.
   - *Authentication > Users* → **Add user** with the owner's email and password.
   - *Authentication > Settings > User actions* → untick **Enable create (sign-up)**, so nobody else can register.
   - *Project settings > Your apps* → add a **Web app** and copy its config values.
2. **Publish the security rules** (only signed-in users can read or write):
   ```
   npx firebase login
   npm run deploy:rules -- --project <your-project-id>
   ```
   Or paste the contents of `firestore.rules` into *Firestore > Rules* in the console and click Publish.
3. **Deploy on Vercel.** Import the repo (or run `npx vercel` in this folder), keep the detected Vite settings,
   and add the six variables from `.env.example` under *Settings > Environment Variables*. Then deploy.
4. **Authorize the domain.** In Firebase *Authentication > Settings > Authorized domains*, add your
   `*.vercel.app` domain, or sign-in will be refused.

`vercel.json` sends every path to `index.html`, so refreshing `/ledger/...` works.
`.env.development` (emulator settings) is used only by `npm run dev`; production builds never read it.

## How the numbers work

- **Quantity** = liters + ml / 1000. **Amount** = quantity × rate.
- **Rate** comes from the supplier's chart. A fat % between two chart rows is interpolated; below or above the chart it uses the nearest end and says so. Rates can be typed in manually (marked `m`).
- **Ledger balance** = milk credited − cash paid (advances + settlement payouts).
  `Cr` means the unit owes the supplier; `Dr` means the supplier still owes on an advance.
- **Settlement** (Ledger page) covers every unsettled entry in the chosen date range. It deducts EMI (each open advance's EMI, oldest first, capped at the milk amount; you can edit it), records the net payout and reduces the advance balance. A settlement can be reversed.
