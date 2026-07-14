export {}

declare global {
  interface Window {
    electronAPI: {
      loadBankroll: () => Promise<number>
      saveBankroll: (amount: number) => Promise<void>
    }
  }
}
