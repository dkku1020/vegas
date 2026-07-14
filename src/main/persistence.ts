import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SaveData } from '@shared/types'

export const DEFAULT_BANKROLL = 1000

function saveFilePath(saveDir: string): string {
  return path.join(saveDir, 'save.json')
}

export async function loadSaveData(saveDir: string): Promise<SaveData> {
  const filePath = saveFilePath(saveDir)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed.bankroll === 'number' && parsed.bankroll >= 0) {
      return { bankroll: parsed.bankroll }
    }
    return { bankroll: DEFAULT_BANKROLL }
  } catch {
    return { bankroll: DEFAULT_BANKROLL }
  }
}

export async function saveSaveData(data: SaveData, saveDir: string): Promise<void> {
  await fs.mkdir(saveDir, { recursive: true })
  await fs.writeFile(saveFilePath(saveDir), JSON.stringify(data, null, 2), 'utf-8')
}
