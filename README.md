# Dairy Collection Manager

Daily milk collection register, supplier rate charts, per-supplier ledger, advances with EMI recovery.
React + Vite, Firebase Firestore.

## Run locally

```
npm install
npm start          # Firestore emulator (port 8080) + app on http://localhost:5173
npm run seed       # optional, in another terminal: 5 sample suppliers, a week of entries, one advance
```

Emulator data is saved to `.emulator-data/` when the emulator shuts down cleanly (Ctrl+C) and reloaded on the next start.
On a phone on the same Wi-Fi, open `http://<this-PC's-IP>:5173`.

## Using a real Firebase project

Put the project's config in `.env.local` with `VITE_USE_EMULATORS=false` (see `.env`).
There is no login yet and `firestore.rules` allows open access, so add authentication before deploying anywhere public.

## How the numbers work

- **Quantity** = liters + ml / 1000. **Amount** = quantity × rate.
- **Rate** comes from the supplier's chart. A fat % between two chart rows is interpolated; below or above the chart it uses the nearest end and says so. Rates can be typed in manually (marked `m`).
- **Ledger balance** = milk credited − cash paid (advances + settlement payouts).
  `Cr` means the unit owes the supplier; `Dr` means the supplier still owes on an advance.
- **Settlement** (Ledger page) covers every unsettled entry in the chosen date range. It deducts EMI (each open advance's EMI, oldest first, capped at the milk amount; you can edit it), records the net payout and reduces the advance balance. A settlement can be reversed.
