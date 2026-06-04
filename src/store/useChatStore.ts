import { create } from 'zustand'
import type { ChatMessage, IngestionTask } from '../types'

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  ingestionTasks: IngestionTask[]
  addMessage: (msg: ChatMessage) => void
  clearMessages: () => void
  setIsStreaming: (v: boolean) => void
  addIngestionTask: (task: IngestionTask) => void
  updateIngestionTask: (id: string, updates: Partial<IngestionTask>) => void
  removeIngestionTask: (id: string) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  ingestionTasks: [],

  addMessage: (msg) => {
    set({ messages: [...get().messages, msg] })
  },

  clearMessages: () => {
    set({ messages: [] })
  },

  setIsStreaming: (v) => {
    set({ isStreaming: v })
  },

  addIngestionTask: (task) => {
    set({ ingestionTasks: [...get().ingestionTasks, task] })
  },

  updateIngestionTask: (id, updates) => {
    set({
      ingestionTasks: get().ingestionTasks.map(t =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })
  },

  removeIngestionTask: (id) => {
    set({
      ingestionTasks: get().ingestionTasks.filter(t => t.id !== id),
    })
  },
}))
