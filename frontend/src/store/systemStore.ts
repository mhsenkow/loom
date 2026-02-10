import { create } from 'zustand'
import type { SystemStatus } from '../types/module'

export interface CloudModelInfo {
    id: string
    name: string
    display_name: string
    provider: string
    provider_type: 'local' | 'cloud'
    context_window?: number
}

interface SystemState {
    status: SystemStatus
    models: string[]
    cloudModels: CloudModelInfo[]
    setStatus: (status: Partial<SystemStatus> | ((prev: SystemStatus) => SystemStatus)) => void
    setModels: (models: string[]) => void
    setCloudModels: (models: CloudModelInfo[]) => void
    setActiveModel: (model: string) => void
    setVisionModel: (model: string) => void
    setImageGenModel: (model: string) => void
}

export const useSystemStore = create<SystemState>((set) => ({
    status: {
        connected: false,
        memoryUsage: 0,
        tokenSpeed: 0,
        activeModel: undefined,
        visionModel: undefined,
    },
    models: [],
    cloudModels: [],
    setStatus: (updater) => set((state) => {
        const newStatus = typeof updater === 'function' ? updater(state.status) : updater
        return { status: { ...state.status, ...newStatus } }
    }),
    setModels: (models) => set({ models }),
    setCloudModels: (cloudModels) => set({ cloudModels }),
    setActiveModel: (model) => set((state) => ({ status: { ...state.status, activeModel: model } })),
    setVisionModel: (model) => set((state) => ({ status: { ...state.status, visionModel: model } })),
    setImageGenModel: (model) => set((state) => ({ status: { ...state.status, imageGenModel: model } })),
}))
