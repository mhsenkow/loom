import { useState, useEffect, useCallback } from 'react'

const API_BASE = 'http://localhost:8000'

interface ProviderInfo {
    name: string
    display_name: string
    connected: boolean
    key_url: string
    key_hint: string
}

interface ProviderSetupProps {
    isOpen: boolean
    onClose: () => void
}

export function ProviderSetup({ isOpen, onClose }: ProviderSetupProps) {
    const [providers, setProviders] = useState<ProviderInfo[]>([])
    const [activeSetup, setActiveSetup] = useState<string | null>(null)
    const [apiKey, setApiKey] = useState('')
    const [validating, setValidating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const fetchProviders = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/providers/`)
            if (res.ok) {
                const data = await res.json()
                setProviders(data.providers || [])
            }
        } catch (e) {
            console.debug('[LOOM] Failed to fetch providers:', e)
        }
    }, [])

    useEffect(() => {
        if (isOpen) {
            fetchProviders()
        }
    }, [isOpen, fetchProviders])

    const handleConnect = async (providerName: string) => {
        if (!apiKey.trim()) {
            setError('Please enter your API key')
            return
        }
        setValidating(true)
        setError(null)
        setSuccess(null)

        try {
            const res = await fetch(`${API_BASE}/api/providers/${providerName}/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey.trim() }),
            })

            if (res.ok) {
                const data = await res.json()
                setSuccess(`Connected to ${data.display_name}!`)
                setApiKey('')
                setActiveSetup(null)
                fetchProviders()
                // Notify the rest of the app
                window.dispatchEvent(new CustomEvent('loom:providers_updated'))
            } else {
                const data = await res.json()
                setError(data.detail || 'Invalid API key. Please check and try again.')
            }
        } catch (e) {
            setError('Could not reach backend. Is the server running?')
        } finally {
            setValidating(false)
        }
    }

    const handleDisconnect = async (providerName: string) => {
        try {
            const res = await fetch(`${API_BASE}/api/providers/${providerName}/disconnect`, {
                method: 'DELETE',
            })
            if (res.ok) {
                fetchProviders()
                window.dispatchEvent(new CustomEvent('loom:providers_updated'))
            }
        } catch (e) {
            console.error('[LOOM] Failed to disconnect provider:', e)
        }
    }

    if (!isOpen) return null

    // Provider icons / colors
    const providerStyle: Record<string, { emoji: string; color: string }> = {
        openai: { emoji: '🤖', color: '#10a37f' },
        anthropic: { emoji: '🧠', color: '#d4a574' },
        gemini: { emoji: '✨', color: '#4285f4' },
        mistral: { emoji: '🌊', color: '#ff7000' },
        deepseek: { emoji: '🔮', color: '#0066ff' },
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.75)',
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div
                style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid #33ff00',
                    width: '90%',
                    maxWidth: 620,
                    maxHeight: '80vh',
                    overflow: 'auto',
                    boxShadow: '0 0 40px rgba(51,255,0,0.15)',
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #1a2332',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <span style={{ color: '#33ff00', fontSize: 13, letterSpacing: 2 }}>
                        ☁ CLOUD AI PROVIDERS
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: '1px solid #333',
                            color: '#666',
                            cursor: 'pointer',
                            padding: '4px 10px',
                            fontFamily: 'inherit',
                            fontSize: 11,
                        }}
                    >
                        ESC
                    </button>
                </div>

                {/* Info */}
                <div
                    style={{
                        padding: '12px 20px',
                        borderBottom: '1px solid #1a2332',
                        color: '#6b7280',
                        fontSize: 11,
                        lineHeight: 1.5,
                    }}
                >
                    Connect to cloud AI models for more powerful reasoning alongside your local Ollama models.
                    API keys are stored locally and never shared.
                </div>

                {/* Success banner */}
                {success && (
                    <div style={{ padding: '10px 20px', background: '#0a1f0a', color: '#33ff00', fontSize: 12 }}>
                        ✅ {success}
                    </div>
                )}

                {/* Provider cards */}
                <div style={{ padding: '12px 16px' }}>
                    {providers.map((prov) => {
                        const style = providerStyle[prov.name] || { emoji: '⚡', color: '#999' }
                        const isSetupActive = activeSetup === prov.name

                        return (
                            <div
                                key={prov.name}
                                style={{
                                    border: `1px solid ${prov.connected ? style.color + '40' : '#1a2332'}`,
                                    marginBottom: 10,
                                    background: prov.connected ? style.color + '08' : '#0d1117',
                                }}
                            >
                                {/* Card header */}
                                <div
                                    style={{
                                        padding: '12px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => {
                                        if (!prov.connected) {
                                            setActiveSetup(isSetupActive ? null : prov.name)
                                            setApiKey('')
                                            setError(null)
                                        }
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 20 }}>{style.emoji}</span>
                                        <div>
                                            <div style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>
                                                {prov.display_name}
                                            </div>
                                            <div style={{ color: '#6b7280', fontSize: 10, marginTop: 2 }}>
                                                {prov.connected
                                                    ? <span style={{ color: style.color }}>● Connected</span>
                                                    : 'Click to set up'
                                                }
                                            </div>
                                        </div>
                                    </div>

                                    {prov.connected ? (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleDisconnect(prov.name)
                                            }}
                                            style={{
                                                background: 'none',
                                                border: '1px solid #333',
                                                color: '#666',
                                                cursor: 'pointer',
                                                padding: '4px 10px',
                                                fontFamily: 'inherit',
                                                fontSize: 10,
                                            }}
                                        >
                                            Disconnect
                                        </button>
                                    ) : (
                                        <span style={{ color: '#333', fontSize: 16 }}>
                                            {isSetupActive ? '▾' : '▸'}
                                        </span>
                                    )}
                                </div>

                                {/* Expanded setup */}
                                {isSetupActive && !prov.connected && (
                                    <div
                                        style={{
                                            padding: '0 16px 14px',
                                            borderTop: '1px solid #1a2332',
                                        }}
                                    >
                                        {/* Get key help */}
                                        <div style={{ padding: '10px 0 8px', fontSize: 11, color: '#6b7280' }}>
                                            1. Get your API key from{' '}
                                            <a
                                                href={prov.key_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ color: style.color, textDecoration: 'underline' }}
                                            >
                                                {prov.key_url.replace('https://', '')}
                                            </a>
                                            <br />
                                            2. Paste it below:
                                        </div>

                                        {/* Key input */}
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input
                                                type="password"
                                                value={apiKey}
                                                onChange={(e) => setApiKey(e.target.value)}
                                                placeholder={prov.key_hint}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleConnect(prov.name)
                                                }}
                                                style={{
                                                    flex: 1,
                                                    background: '#161b22',
                                                    border: '1px solid #333',
                                                    color: '#e6edf3',
                                                    padding: '8px 12px',
                                                    fontFamily: 'inherit',
                                                    fontSize: 12,
                                                }}
                                            />
                                            <button
                                                onClick={() => handleConnect(prov.name)}
                                                disabled={validating || !apiKey.trim()}
                                                style={{
                                                    background: validating ? '#1a2332' : style.color,
                                                    border: 'none',
                                                    color: '#fff',
                                                    padding: '8px 16px',
                                                    cursor: validating ? 'wait' : 'pointer',
                                                    fontFamily: 'inherit',
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    opacity: (!apiKey.trim() || validating) ? 0.5 : 1,
                                                }}
                                            >
                                                {validating ? '...' : 'Connect'}
                                            </button>
                                        </div>

                                        {/* Error */}
                                        {error && (
                                            <div style={{ marginTop: 8, color: '#ff4444', fontSize: 11 }}>
                                                ✗ {error}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {providers.length === 0 && (
                        <div style={{ color: '#6b7280', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                            Loading providers...
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '10px 20px',
                        borderTop: '1px solid #1a2332',
                        color: '#4b5563',
                        fontSize: 10,
                        display: 'flex',
                        justifyContent: 'space-between',
                    }}
                >
                    <span>🔒 Keys stored locally on your machine</span>
                    <span>Local models always available offline</span>
                </div>
            </div>
        </div>
    )
}
