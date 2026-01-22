import { useEffect, useState, ReactNode } from 'react'

interface CRTContainerProps {
  children: ReactNode
  enabled?: boolean
}

export function CRTContainer({ children, enabled = true }: CRTContainerProps) {
  const [flicker, setFlicker] = useState(true)

  // Trigger flicker animation on mount
  useEffect(() => {
    if (enabled) {
      setFlicker(true)
      const timer = setTimeout(() => setFlicker(false), 150)
      return () => clearTimeout(timer)
    }
  }, [enabled])

  return (
    <div className={`relative ${flicker && enabled ? 'crt-flicker' : ''}`}>
      {children}
      
      {/* CRT Scanline Overlay */}
      {enabled && (
        <div 
          className="crt-overlay"
          aria-hidden="true"
        />
      )}
    </div>
  )
}
