import 'vite/client'

export {}

declare global {
  interface Window {
    electronAPI: {
      loadBankroll: () => Promise<number>
      saveBankroll: (amount: number) => Promise<void>
    }
  }
}

declare module '*.css' {
  const content: { [key: string]: string }
  export default content
}
