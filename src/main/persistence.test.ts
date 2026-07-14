import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadSaveData, saveSaveData, DEFAULT_BANKROLL } from './persistence'

let tempDir: string

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vegas-test-'))
})

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('persistence', () => {
  it('returns the default bankroll when no save file exists', async () => {
    const data = await loadSaveData(tempDir)
    expect(data.bankroll).toBe(DEFAULT_BANKROLL)
  })

  it('saves and reloads a bankroll value', async () => {
    await saveSaveData({ bankroll: 2500 }, tempDir)
    const data = await loadSaveData(tempDir)
    expect(data.bankroll).toBe(2500)
  })

  it('falls back to the default when the save file is corrupt', async () => {
    await fs.mkdir(tempDir, { recursive: true })
    await fs.writeFile(path.join(tempDir, 'save.json'), 'not valid json', 'utf-8')
    const data = await loadSaveData(tempDir)
    expect(data.bankroll).toBe(DEFAULT_BANKROLL)
  })

  it('creates the save directory if it does not exist yet', async () => {
    const nestedDir = path.join(tempDir, 'nested')
    await saveSaveData({ bankroll: 500 }, nestedDir)
    const data = await loadSaveData(nestedDir)
    expect(data.bankroll).toBe(500)
  })
})
