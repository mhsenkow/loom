export {}

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void
      maximize: () => void
      toggleMaximize?: () => void
      isMaximized?: () => Promise<boolean>
      onMaximizedChange?: (callback: (maximized: boolean) => void) => (() => void) | void
      close: () => void
    }
    electron?: {
      showOpenDialog: (options: {
        properties: string[]
      }) => Promise<{ canceled: boolean; filePaths: string[] }>
    }
  }
}
