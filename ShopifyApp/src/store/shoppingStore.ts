import { create } from 'zustand';

let _id = 0;
const uid = () => `${Date.now()}_${++_id}`;

export type ItemStatus = 'pending' | 'detected' | 'not_found';

export interface ShoppingItem {
  id: string;
  name: string;
  status: ItemStatus;
  checked?: boolean;
  section?: string;
  detectedBrand?: string;
  product?: Record<string, any>;
  confidence?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposals?: string[];
  proposalResolved?: boolean;
  suggestions?: string[];
  suggestionResolved?: boolean;
}

export interface UserProfile {
  goals: string[];
  restrictions: string[];
  priorities: string[];
}

interface ShoppingStore {
  items: ShoppingItem[];
  sessionId: string | null;
  messages: ChatMessage[];
  userProfile: UserProfile;
  addItem: (name: string) => void;
  removeItem: (id: string) => void;
  updateDetection: (itemName: string, det: {
    brand?: string | null;
    matched: boolean;
    confidence: number;
    product?: Record<string, any> | null;
  }) => void;
  markNotFound: (itemName: string) => void;
  toggleCheck: (id: string) => void;
  setSessionId: (id: string) => void;
  resetDetections: () => void;
  addMessage: (role: 'user' | 'assistant', content: string, proposals?: string[], suggestions?: string[]) => void;
  clearMessages: () => void;
  resolveProposal: (id: string) => void;
  resolveSuggestion: (id: string) => void;
  setUserProfile: (profile: UserProfile) => void;
}

export const useShoppingStore = create<ShoppingStore>((set) => ({
  items: [],
  sessionId: null,
  messages: [],
  userProfile: { goals: [], restrictions: [], priorities: [] },

  addItem: (name) =>
    set((state) => {
      const trimmed = name.trim().toLowerCase();
      if (!trimmed || state.items.some((i) => i.name === trimmed)) return state;
      return {
        items: [
          ...state.items,
          { id: uid(), name: trimmed, status: 'pending' },
        ],
      };
    }),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  updateDetection: (itemName, det) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.name !== itemName.toLowerCase()) return item;
        if (item.status === 'detected') return item;
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

  toggleCheck: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      ),
    })),

  setSessionId: (id) => set({ sessionId: id }),

  resetDetections: () =>
    set((state) => ({
      items: state.items.map((item) => ({ ...item, status: 'pending', detectedBrand: undefined, product: undefined, confidence: undefined })),
      sessionId: null,
    })),

  addMessage: (role, content, proposals?, suggestions?) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: uid(),
          role,
          content,
          ...(proposals && proposals.length > 0 ? { proposals } : {}),
          ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
        },
      ],
    })),

  clearMessages: () => set({ messages: [] }),

  resolveProposal: (id) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, proposalResolved: true } : m
      ),
    })),

  resolveSuggestion: (id) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, suggestionResolved: true } : m
      ),
    })),

  setUserProfile: (profile) => set({ userProfile: profile }),
}));
