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

export interface CaptureMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  feedback?: 'up' | 'down';
  sessionEnd?: boolean;
}

interface ShoppingStore {
  items: ShoppingItem[];
  sessionId: string | null;
  storeMap: string | null;
  messages: ChatMessage[];
  captureMessages: CaptureMessage[];
  captureMode: 'passive' | 'active';
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
  setStoreMap: (base64: string | null) => void;
  setSessionId: (id: string) => void;
  resetDetections: () => void;
  addMessage: (role: 'user' | 'assistant', content: string, proposals?: string[], suggestions?: string[]) => void;
  clearMessages: () => void;
  resolveProposal: (id: string) => void;
  resolveSuggestion: (id: string) => void;
  addCaptureMessage: (role: 'assistant' | 'user', content: string) => void;
  setCaptureFeedback: (id: string, feedback: 'up' | 'down') => void;
  endCaptureSession: () => void;
  setCaptureMode: (mode: 'passive' | 'active') => void;
}

export const useShoppingStore = create<ShoppingStore>((set) => ({
  items: [],
  sessionId: null,
  storeMap: null,
  messages: [],
  captureMessages: [],
  captureMode: 'passive',

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

  setStoreMap: (base64) => set({ storeMap: base64 }),

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

  addCaptureMessage: (role, content) =>
    set((state) => ({
      captureMessages: [
        ...state.captureMessages,
        { id: uid(), role, content },
      ],
    })),

  setCaptureFeedback: (id, feedback) =>
    set((state) => ({
      captureMessages: state.captureMessages.map((m) =>
        m.id === id ? { ...m, feedback } : m
      ),
    })),

  endCaptureSession: () =>
    set((state) => {
      const msgs = [...state.captureMessages];
      if (msgs.length === 0) return state;
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], sessionEnd: true };
      return { captureMessages: msgs, captureMode: 'passive' };
    }),

  setCaptureMode: (mode) => set({ captureMode: mode }),
}));
