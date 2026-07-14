// src/main/ipcHandlers.ts
import { app } from 'electron'
import { loadSaveData, saveSaveData } from './persistence'

export async function handleLoadBankroll(): Promise<number> {
  const data = await loadSaveData(app.getPath('userData'))
  return data.bankroll
}

export async function handleSaveBankroll(amount: number): Promise<void> {
  await saveSaveData({ bankroll: amount }, app.getPath('userData'))
}
