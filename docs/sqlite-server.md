# FleetPilot on SQLite

Browsers cannot open a database file directly, so this adds a small API between the app and the database:

    FleetPilot (browser / .exe)  --HTTP-->  server/ (Node + Express)  --node:sqlite-->  data/fleetpilot.db

The server uses Node's built-in `node:sqlite` module, so there is no database server to install and no
native driver to compile. It needs **Node 22.13 or newer** (Node 24 recommended).

IndexedDB stays on as an offline cache. If the server is unreachable the app keeps working and
re-syncs automatically when it is back.

## Files involved
| File | Purpose |
|---|---|
| `server/schema.sql` | Tables: vehicles, drivers, clients, bookings, rentals, expenses, payments, driver_allowances, app_state. Applied automatically on startup |
| `server/index.js`, `ledgerStore.js`, `db.js` | The API (`GET/PUT /api/ledger`, `GET /api/health`) |
| `server/import-xlsx.js` | Loads an existing FleetPilot Excel export into SQLite |
| `src/data/serverRepository.js` | New repository, drop-in for `LocalFleetRepository` (same `load()` / `save()`) |
| `src/main.js` | Chooses the repository from `VITE_API_URL` |
| `.env.example`, `server/.env.example` | Settings |

## Steps
1. **Server**:
   ```
   cd server
   copy .env.example .env      (optionally change DB_FILE / API_KEY)
   npm install
   npm start
   ```
   The database file (`server/data/fleetpilot.db` by default) and its tables are created on first start.
   Check http://localhost:3001/api/health shows `{"ok":true}`.
2. **Move your existing data** (use an Excel export from the app):
   `npm run import -- "C:\path\to\Fleet Ledger.xlsx"`
3. **App**: copy `.env.example` to `.env.local` in the project root, set `VITE_API_URL=http://localhost:3001`,
   then rebuild/run as usual.

Leave `VITE_API_URL` empty to go back to local-only mode.

## How it behaves
- **Save**: every change is written to IndexedDB first, then pushed to the server (whole ledger, one transaction).
- **Two devices**: each save carries the revision it last saw. If another device saved in between, the
  server answers 409 and the app stops pushing (console message + `fleetpilot:sync` event with
  `status: 'conflict'`). Resolve in the browser console:
  `fleetRepository.pull()` takes the server copy, `fleetRepository.forcePush()` overwrites the server.
- **First run**: if the server is empty and this device already has data, that data is uploaded automatically.
  If the server already has data and you also have older local-only data, the server copy wins, so import first.
- **Bad references** (e.g. an expense pointing at a deleted vehicle) are cleared to NULL and listed as warnings.

## Security notes
- The admin PIN in this app is not authentication, and `API_KEY` is a shared secret that ends up inside the
  built JavaScript. Fine for your own LAN/VPN; before exposing this on the internet put it behind HTTPS and
  add real sign-in (the README roadmap already lists this).
- Only the API process should have access to the `.db` file; don't put it in a shared or web-served folder.
- Back up with `sqlite3 server/data/fleetpilot.db ".backup backup.db"`, or stop the server and copy
  `fleetpilot.db` (plus any `-wal` / `-shm` files next to it).
