/**
 * Offline Storage Utility using IndexedDB
 * Handles local storage of products, transactions, and sync queue
 */

const DB_NAME = 'pos-offline-db';
const DB_VERSION = 1;

interface OfflineTransaction {
  id: string;
  tenant: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  paymentMethod: 'cash' | 'card' | 'digital';
  cashReceived?: number;
  discountCode?: string;
  timestamp: number;
  synced: boolean;
  syncError?: string;
}

interface CachedProduct {
  _id: string;
  name: string;
  price: number;
  stock: number;
  sku?: string;
  category?: string;
  tenant: string;
  lastUpdated: number;
}

class OfflineStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Transactions store
        if (!db.objectStoreNames.contains('transactions')) {
          const transactionStore = db.createObjectStore('transactions', { keyPath: 'id' });
          transactionStore.createIndex('tenant', 'tenant', { unique: false });
          transactionStore.createIndex('synced', 'synced', { unique: false });
          transactionStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Products cache store
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: '_id' });
          productStore.createIndex('tenant', 'tenant', { unique: false });
          productStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }
      };
    });
  }

  private getDB(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  // Transaction methods
  async saveTransaction(transaction: Omit<OfflineTransaction, 'id' | 'timestamp' | 'synced'>): Promise<string> {
    const id = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullTransaction: OfflineTransaction = {
      ...transaction,
      id,
      timestamp: Date.now(),
      synced: false,
    };

    return new Promise((resolve, reject) => {
      const tx = this.getDB().transaction(['transactions'], 'readwrite');
      const store = tx.objectStore('transactions');
      const request = store.add(fullTransaction);

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingTransactions(tenant: string): Promise<OfflineTransaction[]> {
    return new Promise((resolve, reject) => {
      const tx = this.getDB().transaction(['transactions'], 'readonly');
      const store = tx.objectStore('transactions');
      const index = store.index('tenant');
      const request = index.getAll(tenant);

      request.onsuccess = () => {
        const transactions = request.result as OfflineTransaction[];
        const pending = transactions.filter(t => !t.synced);
        resolve(pending.sort((a, b) => a.timestamp - b.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async markTransactionSynced(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.getDB().transaction(['transactions'], 'readwrite');
      const store = tx.objectStore('transactions');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const transaction = getRequest.result;
        if (transaction) {
          transaction.synced = true;
          const updateRequest = store.put(transaction);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async markTransactionError(id: string, error: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.getDB().transaction(['transactions'], 'readwrite');
      const store = tx.objectStore('transactions');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const transaction = getRequest.result;
        if (transaction) {
          transaction.syncError = error;
          const updateRequest = store.put(transaction);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.getDB().transaction(['transactions'], 'readwrite');
      const store = tx.objectStore('transactions');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Product cache methods
  async cacheProducts(products: CachedProduct[], tenant: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.getDB().transaction(['products'], 'readwrite');
      const store = tx.objectStore('products');
      
      // Clear old products for this tenant
      const index = store.index('tenant');
      const clearRequest = index.openKeyCursor(IDBKeyRange.only(tenant));
      
      clearRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          // Now add new products
          const now = Date.now();
          const promises = products.map(product => {
            const cached: CachedProduct = {
              ...product,
              tenant,
              lastUpdated: now,
            };
            return new Promise<void>((res, rej) => {
              const req = store.put(cached);
              req.onsuccess = () => res();
              req.onerror = () => rej(req.error);
            });
          });

          Promise.all(promises)
            .then(() => resolve())
            .catch(reject);
        }
      };
      clearRequest.onerror = () => reject(clearRequest.error);
    });
  }

  async getCachedProducts(tenant: string): Promise<CachedProduct[]> {
    return new Promise((resolve, reject) => {
      const tx = this.getDB().transaction(['products'], 'readonly');
      const store = tx.objectStore('products');
      const index = store.index('tenant');
      const request = index.getAll(tenant);

      request.onsuccess = () => {
        const products = request.result as CachedProduct[];
        resolve(products);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async updateProductStock(productId: string, newStock: number, tenant: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.getDB().transaction(['products'], 'readwrite');
      const store = tx.objectStore('products');
      const getRequest = store.get(productId);

      getRequest.onsuccess = () => {
        const product = getRequest.result;
        if (product && product.tenant === tenant) {
          product.stock = newStock;
          product.lastUpdated = Date.now();
          const updateRequest = store.put(product);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }
}

// Singleton instance
let storageInstance: OfflineStorage | null = null;

export async function getOfflineStorage(): Promise<OfflineStorage> {
  if (!storageInstance) {
    storageInstance = new OfflineStorage();
    await storageInstance.init();
  }
  return storageInstance;
}

export type { OfflineTransaction, CachedProduct };

