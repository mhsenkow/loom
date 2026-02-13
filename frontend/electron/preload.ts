import { contextBridge, ipcRenderer } from 'electron'

type MaximizeListener = (maximized: boolean) => void

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  toggleMaximize: () => ipcRenderer.send('window-maximize'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized') as Promise<boolean>,
  onMaximizedChange: (callback: MaximizeListener) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => {
      callback(maximized)
    }
    ipcRenderer.on('window-maximized-changed', listener)
    return () => ipcRenderer.removeListener('window-maximized-changed', listener)
  },
  close: () => ipcRenderer.send('window-close'),
})

declare global {
  interface Window {
    electronAPI: {
      minimize: () => void
      maximize: () => void
      toggleMaximize: () => void
      isMaximized: () => Promise<boolean>
      onMaximizedChange: (callback: MaximizeListener) => () => void
      close: () => void
    }
  }
}
