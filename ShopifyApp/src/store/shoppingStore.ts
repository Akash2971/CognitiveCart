import { create } from 'zustand';

export type ItemStatus = 'pending' | 'detected' | 'not_found';

export interface ShoppingItem {
  id: string;
  name: string;
  status: ItemStatus;
  detectedBrand?: string;
  product?: Record<string, any>;
  confidence?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ShoppingStore {
  items: ShoppingItem[];
  sessionId: string | null;
  messages: ChatMessage[];
  addItem: (name: string) => void;
  removeItem: (id: string) => void;
  updateDetection: (itemName: string, det: {
    brand?: string | null;
    matched: boolean;
    confidence: number;
    product?: Record<string, any> | null;
  }) => void;
  markNotFound: (itemName: string) => void;
  setSessionId: (id: string) => void;
  resetDetections: () => void;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  clearMessages: () => void;
}

export const useShoppingStore = create<ShoppingStore>((set) => ({
  items: [],
  sessionId: null,
  messages: [],

  addItem: (name) =>
    set((state) => {
      const trimmed = name.trim().toLowerCase();
      if (!trimmed || state.items.some((i) => i.name === trimmed)) return state;
      return {
        items: [
          ...state.items,
          { id: Date.now().toString(), name: trimmed, status: 'pending' },
        ],
      };
    }),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  updateDetection: (itemName, det) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.name !== itemName.toLowerCase()) return item;
        if (item.status === 'detected') return item; // never downgrade
        return {
          ...item,
          status: det.matched ? 'detected' : 'not_found',
          detectedBrand: det.brand ?? undefined,
          product: det.product ?? undefined,
          confidence: det.confidence,
        };
      }),
    })),

  markNotFound: (itemName) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.name === itemName.toLowerCase()
          ? { ...item, status: 'not_found' }
          : item
      ),
    })),

  setSessionId: (id) => set({ sessionId: id }),

  resetDetections: () =>
    set((state) => ({
      items: state.items.map((item) => ({ ...item, status: 'pending', detectedBrand: undefined, product: undefined, confidence: undefined })),
      sessionId: null,
    })),

  addMessage: (role, content) =>
    set((state) => ({
      messages: [...state.messages, { id: Date.now().toString(), role, content }],
    })),

  clearMessages: () => set({ messages: [] }),
}));
