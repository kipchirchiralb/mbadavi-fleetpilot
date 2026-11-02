# Mbadavi Fleetpilot

Fleet and rental ledger for Mbadavi Investment Limited. It's a Vite web app (installable as a PWA) packaged as a Windows desktop app with Electron.

## Commands

```powershell
npm install
npm run dev                # browser dev server with hot reload
npm run desktop            # build, then open the desktop app
npm start                  # open the desktop app using the existing dist/ build
npm run desktop:portable   # build release/FleetPilot <version>.exe (single portable file)
npm run desktop:installer  # build release/FleetPilot Setup <version>.exe (NSIS installer)
npm run build              # production web build in dist/
npm run preview            # serve dist/ locally
```

## Project layout

```
electron/
  main.cjs              Electron main process: window, single-instance lock, link handling
index.html              App markup (Vite entry)
public/                 Icons copied as-is into the build
build/                  electron-builder resources (app icon)
src/
  main.js               Renderer bootstrap: picks the data repository, registers the service worker, starts the app
  data/                 Persistence boundary
    repository.js       LocalFleetRepository (IndexedDB)
    serverRepository.js ServerFleetRepository (optional SQLite API, see docs/sqlite-server.md)
  app/
    index.js            startApp(): wires every module's event handlers in order, then loads the ledger
    app.js              renderAll() / initial ledger load
    core/               Shared state, autosave, periods, closed-month locking, validation, formatting, sanitizer
    ui/                 Shell (nav, full screen), dialogs and toasts, form edit mode, shared selects,
                        record navigation, app-wide keyboard/usability behaviour (enhancements.js)
    features/           Vehicles, drivers, allowances, clients, bookings, rentals, expenses, payments,
                        file save/load, month compare, global search, watchlist, admin PIN, daily info & alerts
    dashboard/          Dashboard cards/widgets, trend charts, fleet chart, upcoming bookings
    reports/            Period ranges, reports, analysis, statistics, leased cars, vehicle & expense statements
    excel/              Workbook schema, data sheets, styled report sheets, workbook <-> ledger conversion
  styles/               CSS split by area; index.css imports them in cascade order
  assets/images/        Logo and watermark images
server/                 Optional Node + SQLite API (its own package.json)
docs/                   Additional guides
```

### Module conventions

- Shared ledger state (`db`, `dirty`, current file, …) lives in `src/app/core/state.js`. Other modules read it through imports and change it only through the exported setters (`setDb`, `setDirty`, …), because ES module imports are read-only.
- A module's top level only declares things. DOM event wiring lives in that module's `init…()` function, and `src/app/index.js` calls those in a fixed order once every module has loaded.
- User-entered text placed into HTML templates is wrapped in `escapeHTML()`. As a second layer, all dynamic `innerHTML` goes through the sanitizer that `core/sanitize.js` installs, which removes scripts, inline event handlers and `javascript:` URLs. Production builds also carry a Content-Security-Policy (see `vite.config.js`).
- Notifications use `toast(message, type)`, where `type` is `'error'` (orange-red), `'success'` (green) or `'info'` (the default).

## Troubleshooting

- **`EPERM: operation not permitted, rename ...win-unpacked.tmp` when packaging.** Something is locking new folders inside the project, usually Windows Defender's Controlled Folder Access or antivirus scanning the freshly extracted `electron.exe`. Allow Node/electron-builder in that tool, or build to another folder, e.g. `npx electron-builder --win portable --config.directories.output=C:\fleetpilot-release`.
- **The app starts as plain Node from a VS Code terminal.** VS Code sets `ELECTRON_RUN_AS_NODE`. Run `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell) first.

## Data

`src/data/repository.js` is the local persistence boundary. The whole working ledger is saved to IndexedDB after each change and restored when the app opens. Excel workbooks are the portable format for import, export and backup. To move data between devices, export to Excel.

To keep data in a shared SQLite database instead, set `VITE_API_URL` (see `.env.example`) and run the server in `server/`. The details are in [docs/sqlite-server.md](docs/sqlite-server.md). If `VITE_API_URL` is blank, the app stays local-only.

The admin PIN is not authentication.

## Roadmap

1. Validate workbook import/export against real ledger files.
2. Add secure sign-in for the Mbadavi owner account and a hosted database.
3. Add retryable offline-to-cloud sync, conflict handling, and recovery tests across desktop and phone.
4. Package for Android with Capacitor once storage and sync are stable.
