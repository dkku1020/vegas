import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  loadBankroll: (): Promise<number> => ipcRenderer.invoke('load-bankroll'),
  saveBankroll: (amount: number): Promise<void> => ipcRenderer.invoke('save-bankroll', amount)
})
