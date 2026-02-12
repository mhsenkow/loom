interface FloatingToolbarProps {
  onImageGenClick: () => void
  onFolderContextClick: () => void
  onAvatarClick?: () => void
  imageGenActive?: boolean
  folderContextActive?: boolean
  avatarActive?: boolean
}

export function FloatingToolbar({
  onImageGenClick,
  onFolderContextClick,
  onAvatarClick,
  imageGenActive = false,
  folderContextActive = false,
  avatarActive = false,
}: FloatingToolbarProps) {
  return (
    <div className="fixed top-1/2 -translate-y-1/2 right-2 sm:right-6 z-30 flex flex-col gap-2">
      {/* Avatar / Voice – 8-bit sparkle */}
      {onAvatarClick && (
        <button
          onClick={onAvatarClick}
          className={`
            w-12 h-12 flex items-center justify-center
            bg-slate/90 backdrop-blur-sm
            border border-phosphor/30
            text-phosphor/70
            transition-all duration-200
            hover:border-phosphor hover:text-phosphor hover:bg-slate
            hover:shadow-[0_0_12px_rgba(51,255,0,0.3)]
            active:translate-x-[1px] active:translate-y-[1px]
            font-mono text-lg
            ${avatarActive ? 'border-phosphor text-phosphor shadow-[0_0_12px_rgba(51,255,0,0.5)]' : ''}
          `}
          title="Avatar & Voice"
          style={{ imageRendering: 'pixelated' }}
        >
          <span className="leading-none" style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}>
            ✦
          </span>
          {avatarActive && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-phosphor shadow-[0_0_6px_rgba(51,255,0,0.8)]" />
          )}
        </button>
      )}

      {/* Image Generation Icon */}
      <button
        onClick={onImageGenClick}
        className={`
          w-12 h-12 flex items-center justify-center
          bg-slate/90 backdrop-blur-sm
          border border-phosphor/30
          text-phosphor/70
          transition-all duration-200
          hover:border-phosphor hover:text-phosphor hover:bg-slate
          hover:shadow-[0_0_12px_rgba(51,255,0,0.3)]
          active:translate-x-[1px] active:translate-y-[1px]
          ${imageGenActive ? 'border-phosphor text-phosphor shadow-[0_0_12px_rgba(51,255,0,0.5)]' : ''}
        `}
        title="Generate Image (/imagine)"
      >
        <span className="text-xl leading-none" style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}>
          🎨
        </span>
        {imageGenActive && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-phosphor shadow-[0_0_6px_rgba(51,255,0,0.8)]" />
        )}
      </button>

      {/* Folder Context Icon */}
      <button
        onClick={onFolderContextClick}
        className={`
          w-12 h-12 flex items-center justify-center
          bg-slate/90 backdrop-blur-sm
          border border-phosphor/30
          text-phosphor/70
          transition-all duration-200
          hover:border-phosphor hover:text-phosphor hover:bg-slate
          hover:shadow-[0_0_12px_rgba(51,255,0,0.3)]
          active:translate-x-[1px] active:translate-y-[1px]
          ${folderContextActive ? 'border-phosphor text-phosphor shadow-[0_0_12px_rgba(51,255,0,0.5)]' : ''}
        `}
        title="Folder Context (Code Project)"
      >
        <span className="text-xl leading-none" style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}>
          📁
        </span>
        {folderContextActive && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-phosphor shadow-[0_0_6px_rgba(51,255,0,0.8)]" />
        )}
      </button>
    </div>
  )
}
