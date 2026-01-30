/** Resolve avatar color scheme to hex values using theme or preset */
export function getAvatarColors(scheme: string): { primary: string; secondary: string; accent: string; glow: string } {
  const theme = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const getVar = (v: string) => (theme ? theme.getPropertyValue(v).trim() : '')

  switch (scheme) {
    case 'theme':
      return {
        primary: getVar('--theme-phosphor') || '#33ff00',
        secondary: getVar('--theme-phosphor-dim') || '#1a8000',
        accent: '#88ffaa', // lighter, slightly cyan for outer sparkle
        glow: getVar('--theme-phosphor-glow') || 'rgba(51,255,0,0.5)',
      }
    case 'ruby':
      return {
        primary: '#ff4422', // deeper red core
        secondary: '#e85c20', // orange mid
        accent: '#ffcc44', // golden outer sparkle
        glow: 'rgba(232,92,32,0.5)',
      }
    case 'sapphire':
      return {
        primary: '#2255ff', // deep blue core
        secondary: '#3d8cff', // mid blue
        accent: '#88ddff', // cyan outer sparkle
        glow: 'rgba(61,140,255,0.5)',
      }
    case 'nebula':
      return {
        primary: '#00ddaa', // teal core
        secondary: '#00ffcc', // cyan mid
        accent: '#aaffee', // pale cyan outer sparkle
        glow: 'rgba(0,255,204,0.5)',
      }
    default:
      return {
        primary: getVar('--theme-phosphor') || '#33ff00',
        secondary: getVar('--theme-phosphor-dim') || '#1a8000',
        accent: '#88ffaa',
        glow: getVar('--theme-phosphor-glow') || 'rgba(51,255,0,0.5)',
      }
  }
}

export function hexToVec3(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return [r, g, b]
}
