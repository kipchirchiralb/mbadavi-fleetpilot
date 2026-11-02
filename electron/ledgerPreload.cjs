/* FleetPilot desktop side of the database. Runs in the Electron PRELOAD script: gives the page (window.fleetDesktop) a few safe doors, nothing else.
   The page can only reach the database folder through these; it cannot read or write any other path. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fleetDesktop', {
  dbSettings: () => ipcRenderer.invoke('db:settings'),
  dbSetSettings: patch => ipcRenderer.invoke('db:setSettings', patch),
  dbLoad: name => ipcRenderer.invoke('db:load', name),
  dbSave: (name, data) => ipcRenderer.invoke('db:save', name, data),
  dbSaveSync: (name, data) => ipcRenderer.sendSync('db:saveSync', name, data),   // for the moment the window closes
  dbCreate: (name, data) => ipcRenderer.invoke('db:create', name, data),
  dbCopies: () => ipcRenderer.invoke('db:copies'),
  dbReadCopy: id => ipcRenderer.invoke('db:readCopy', id),
  dbShowFolder: () => ipcRenderer.invoke('db:showFolder'),
  onFlush: cb => ipcRenderer.on('db:flush', async () => { try{ await cb(); }finally{ ipcRenderer.send('db:flushed'); } })
});
