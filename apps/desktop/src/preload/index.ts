import { contextBridge, ipcRenderer } from 'electron';
import type { HostAPI } from '../shared';
const methods = new Set([
  'boot',
  'recoverDraft',
  'getScenarios',
  'saveScenarios',
  'runScenario',
  'close',
  'debug',
  'newProject',
  'openProject',
  'saveProject',
  'recovery',
  'exportGame',
  'openGame',
  'play',
  'command',
  'travel',
  'cancel',
  'stop',
  'undo',
  'redo',
  'restart',
  'saveGame',
  'loadGame',
  'exportTranscript',
  'settings',
  'updateSettings',
  'testConnection',
]);
const api: HostAPI = {
  invoke: (method, payload) => {
    if (!methods.has(method)) return Promise.reject(new Error('Unknown operation.'));
    return ipcRenderer.invoke('elsewhen:invoke', method, payload);
  },
  onMenu: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('elsewhen:menu', handler);
    return () => ipcRenderer.removeListener('elsewhen:menu', handler);
  },
};
contextBridge.exposeInMainWorld('elsewhen', api);
