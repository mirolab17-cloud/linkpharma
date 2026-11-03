// src/store/useCartStore.ts
import { create } from 'zustand';
import { CartItem } from '../types';

const STORAGE_KEY = 'pharma_comparison_cart_v1';

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  updateQty: (productId: string, supplierId: string, qty: number) => void;
  removeItem: (productId: string, supplierId: string) => void;
  clearSupplierItems: (supplierId: string) => void;
  clearCart: () => void;
  getSupplierGroups: () => Record<string, { supplierId: string; supplierName: string; supplierWhatsapp: string; items: CartItem[]; subtotal: number }>;
  getTotalItemsCount: () => number;
  getTotalAmount: () => number;
}

const loadInitialItems = (): CartItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse cart from localStorage', e);
    return [];
  }
};

const saveItems = (items: CartItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save cart to localStorage', e);
  }
};

export const useCartStore = create<CartState>((set, get) => ({
  items: loadInitialItems(),

  addItem: (item, qty = 1) => {
    if (qty <= 0) return;
    const current = get().items;
    const index = current.findIndex(
      (i) => i.productId === item.productId && i.supplierId === item.supplierId
    );

    let updated: CartItem[];
    if (index > -1) {
      updated = [...current];
      updated[index] = {
        ...updated[index],
        qty: updated[index].qty + qty,
        price: item.price, // تحديث السعر للأحدث
      };
    } else {
      updated = [...current, { ...item, qty }];
    }

    set({ items: updated });
    saveItems(updated);
  },

  updateQty: (productId, supplierId, qty) => {
    const current = get().items;
    if (qty <= 0) {
      get().removeItem(productId, supplierId);
      return;
    }

    const updated = current.map((item) => {
      if (item.productId === productId && item.supplierId === supplierId) {
        return { ...item, qty };
      }
      return item;
    });

    set({ items: updated });
    saveItems(updated);
  },

  removeItem: (productId, supplierId) => {
    const updated = get().items.filter(
      (item) => !(item.productId === productId && item.supplierId === supplierId)
    );
    set({ items: updated });
    saveItems(updated);
  },

  clearSupplierItems: (supplierId) => {
    const updated = get().items.filter((item) => item.supplierId !== supplierId);
    set({ items: updated });
    saveItems(updated);
  },

  clearCart: () => {
    set({ items: [] });
    saveItems([]);
  },

  getSupplierGroups: () => {
    const items = get().items;
    const groups: Record<string, { supplierId: string; supplierName: string; supplierWhatsapp: string; items: CartItem[]; subtotal: number }> = {};

    items.forEach((item) => {
      if (!groups[item.supplierId]) {
        groups[item.supplierId] = {
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          supplierWhatsapp: item.supplierWhatsapp,
          items: [],
          subtotal: 0,
        };
      }
      groups[item.supplierId].items.push(item);
      groups[item.supplierId].subtotal += item.price * item.qty;
    });

    return groups;
  },

  getTotalItemsCount: () => {
    return get().items.reduce((sum, item) => sum + item.qty, 0);
  },

  getTotalAmount: () => {
    return get().items.reduce((sum, item) => sum + item.price * item.qty, 0);
  },
}));
