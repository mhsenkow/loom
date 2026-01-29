export {}

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
    electron?: {
      showOpenDialog: (options: {
        properties: string[]
      }) => Promise<{ canceled: boolean; filePaths: string[] }>
    }
  }
}
