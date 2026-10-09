import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('blueBot', {
  getAgentStatus: () => ipcRenderer.invoke('agent:status'),
  chat: (message: string) => ipcRenderer.invoke('agent:chat', message),
  getWindowMeta: () => ipcRenderer.invoke('window:get'),
  refreshWindow: () => ipcRenderer.invoke('window:refresh'),
  openChat: () => ipcRenderer.invoke('ui:openChat'),
  closeChat: () => ipcRenderer.invoke('ui:closeChat'),
  toggleChat: () => ipcRenderer.invoke('ui:toggleChat'),
  movePet: (dx: number, dy: number) => ipcRenderer.invoke('ui:movePet', dx, dy),
  onWindowUpdated: (cb: (meta: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, meta: unknown) => cb(meta);
    ipcRenderer.on('window:updated', listener);
    return () => ipcRenderer.removeListener('window:updated', listener);
  },
});
