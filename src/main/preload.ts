import { contextBridge, ipcRenderer } from 'electron';

export interface PagePayload {
  title: string;
  url: string;
  text: string;
}

contextBridge.exposeInMainWorld('blueBot', {
  updatePage: (payload: PagePayload) => ipcRenderer.invoke('page:update', payload),
  getPageMeta: () => ipcRenderer.invoke('page:get'),
  clearPage: () => ipcRenderer.invoke('page:clear'),
  getAgentStatus: () => ipcRenderer.invoke('agent:status'),
  chat: (message: string) => ipcRenderer.invoke('agent:chat', message),
});
