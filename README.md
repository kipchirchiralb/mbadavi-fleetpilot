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

The app source is the v22 update (see `docs/CHANGES-v22.txt` for every change from v3 to v22).
The previous modular version is kept untouched in `backup-before-v22/`.

```
electron/
  main.cjs              Electron main process: window, single-instance lock, link handling
  ledgerFile.cjs        Database file in %APPDATA%\FleetPilot (save on every change, monthly copies, format upgrades)
  ledgerPreload.cjs     Preload: gives the page window.fleetDesktop (the only door to that folder)
index.html              App markup and styles (Vite entry, self-contained)
public/                 Icons copied as-is into the build
build/                  electron-builder resources (app icon)
src/
  main.js               Bootstrap: error bar, ExcelJS, IndexedDB fallback, table tools, keyboard nav, then ledger.js
  ledger.js             The app core: state, screens, save/open, dashboard, reports
  dbPersist.js          Opens/saves the desktop database file; moves old browser storage into it once
  data/repository.js    IndexedDB storage (browser use, and fallback in the .exe)
  importer/             Excel import of the PERFOMANCE workbook (rentals, expenses, invoices, payments, admin sheets)
  calendar.js, holidays.js, today.js, idle.js           Calendar, Kenyan holidays, Today box, idle screen
  performance.js, carPerf.js, balance.js, chips.js      Performance, per-car figures, balance check, filter chips
  fuel*.js, coop.js, subhire*.js, loans.js              Fuel account, Coop, Sub-hire, Loans
  payRoute.js, payUi.js                                 Payments hub (money in / money out)
  pilot*.js, pages.js, ownerSheets.js, fileLayout.js    Admin (Pilot), Pages, Excel save layout
test/                   Node tests (*.test.mjs) and older headless-browser scripts (*.py)
server/                 Old optional SQLite API: no longer used by the app
docs/                   CHANGES-v22.txt, WORKFLOW.md, desktop-database.txt
```

### Tests

Run each from inside `test/`, e.g. `cd test; node yearround.test.mjs`. All 25 `*.test.mjs` files pass.

## Troubleshooting

- **`EPERM: operation not permitted, rename ...win-unpacked.tmp` when packaging.** Something is locking new folders inside the project, usually Windows Defender's Controlled Folder Access or antivirus scanning the freshly extracted `electron.exe`. Allow Node/electron-builder in that tool, or build to another folder, e.g. `npx electron-builder --win portable --config.directories.output=C:\fleetpilot-release`.
- **The app starts as plain Node from a VS Code terminal.** VS Code sets `ELECTRON_RUN_AS_NODE`. Run `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell) first.

## Data

In the desktop app the ledger is a file: `%APPDATA%\FleetPilot\databases\<name>.fpdb.json`, written about half a second after each change and again when the window closes. One safety copy per month goes to `copies\`. Installing a newer version never touches this folder. Pilot > Database chooses which database opens at start.

On the first start after the update, the data in the old browser storage (IndexedDB) is moved into the file once. In a plain browser (`npm run dev`) the app keeps using IndexedDB.

Excel is only used when you ask: File & backup > Save (to Excel) / Import.

The admin PIN is not authentication.

## Roadmap

1. Validate workbook import/export against real ledger files.
2. Add secure sign-in for the Mbadavi owner account and a hosted database.
3. Add retryable offline-to-cloud sync, conflict handling, and recovery tests across desktop and phone.
4. Package for Android with Capacitor once storage and sync are stable.
