THE DATABASE FILE FOR THE .EXE   (v21)

I could not see your Electron main and preload files (only the web part was in the zip), so I could not check the app name and ID there.
It does not matter for the data any more: the database is kept in a FIXED folder, %APPDATA%\FleetPilot (not under the app name), so a changed name or ID cannot make it look empty.

IF YOU ALREADY ADDED THE v15-v20 LINES, NOTHING NEW TO WIRE: just replace these two files and rebuild.
  desktop\ledgerFile.cjs   and   desktop\ledgerPreload.cjs   (same names, same two lines, new contents)
IF NOT, add them once:
 1. Copy both files next to your Electron main file.
 2. In the MAIN file, after the app is ready:   require('./ledgerFile.cjs').registerLedgerFile();
 3. In the preload (or your BrowserWindow preload setting):   require('./ledgerPreload.cjs');   (contextIsolation: true, the default)
 4. Rebuild (npm run desktop:portable). If you send me the two Electron files I will wire it myself.
If the old files are still in the build, the app says so in a yellow note and keeps using the browser storage.

WHAT IS IN %APPDATA%\FleetPilot
  databases\   your database(s), one file each (.fpdb.json). Pilot > Database chooses which opens at start (default: the last one used).
  copies\      one safety copy per month (first save of the month), and one copy of an old-format file before it is upgraded.
  damaged\     a file that could not be read is moved here, never overwritten.
  settings.json  which database opens at start.
Installing a newer version replaces the program only. An uninstall keeps this folder (it is not the app's own userData folder).
Only one copy of the program can run at a time (a second start brings the first to the front), so two copies can never overwrite each other.
The old Excel files in Documents\FleetPilot from v15-v20 are not touched and not used any more; File > Open can still load one.
