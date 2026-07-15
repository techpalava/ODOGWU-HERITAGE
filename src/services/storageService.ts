/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CustomGroup,
  Fabric,
  StyleCategory,
  Showpiece,
  CommunityPhoto,
  Customer,
  MasterOrder,
  Batch,
  BusinessSettings,
} from "../types";
import { db } from "./firebase";
import { ImageService } from "./imageService";
import { legacyCompatMap } from "../utils/legacyCompat";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  deleteDoc,
  onSnapshot
} from "firebase/firestore";


function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function sanitizeForFirestore(val: any): any {
  if (val === undefined) {
    return null;
  }
  if (val === null) {
    return null;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeForFirestore);
  }
  if (typeof val === "object") {
    const res: any = {};
    for (const key of Object.keys(val)) {
      const sanitized = sanitizeForFirestore(val[key]);
      if (sanitized !== undefined) {
        res[key] = sanitized;
      }
    }
    return res;
  }
  if (typeof val === "string") {
    // Firestore max document size is 1MB (1,048,576 bytes).
    // A string > 300KB is risky and likely a base64 image.
    if (val.length > 300000 && val.startsWith("data:image")) {
      console.warn(
        "Stripping excessively large base64 image to prevent Firestore crash.",
      );
      return null;
    }
    return val;
  }
  return val;
}

/**
 * StorageService abstracts database interactions to Firestore.
 */
export const StorageService = {
  safeParse: <T>(saved: string | null): T | null => {
    if (!saved || saved === "undefined") return null;
    try {
      return JSON.parse(saved) as T;
    } catch (e) {
      console.warn("Error parsing JSON", e);
      return null;
    }
  },

  // Helper to fetch collection
  async fetchCollection<T>(collectionName: string): Promise<T[]> {
    try {
      const querySnapshot = await getDocs(collection(db, collectionName));
      return querySnapshot.docs.map((doc) => legacyCompatMap(collectionName, { id: doc.id, ...doc.data() } as T));
    } catch (error) {
      console.error(`Error fetching collection ${collectionName}:`, error);
      return [];
    }
  },

  // Helper to subscribe to collection
  subscribeToCollection<T>(collectionName: string, callback: (data: T[]) => void) {
    return onSnapshot(collection(db, collectionName), (snapshot) => {
      const items = snapshot.docs.map(doc => legacyCompatMap(collectionName, { id: doc.id, ...doc.data() } as T));
      callback(items);
    }, (error) => {
      console.error(`Error subscribing to collection ${collectionName}:`, error);
    });
  },

  subscribeToDocument<T>(collectionName: string, documentId: string, callback: (data: T | null) => void) {
    return onSnapshot(doc(db, collectionName, documentId), (snapshot) => {
      if (snapshot.exists()) {
        callback(legacyCompatMap(collectionName, { id: snapshot.id, ...snapshot.data() } as T));
      } else {
        callback(null);
      }
    }, (error) => {
      console.error(`Error subscribing to document ${collectionName}/${documentId}:`, error);
    });
  },

  // Helper to save entire collection (replace all)
  // For small prototype collections, we can just rewrite or merge them.
  // A better approach is to use individual setDocs. We'll use a batch to write them.
  async saveCollection<T>(
    collectionName: string,
    items: T[],
    getId: (item: T) => string,
  ) {
    console.log("saveCollection called for:", collectionName);
    try {
      const existingDocs = await getDocs(collection(db, collectionName));

      const batch = writeBatch(db);

      // Helper to extract all storage URLs from an object
      const extractStorageUrls = (obj: any): string[] => {
        let urls: string[] = [];
        if (obj === undefined || obj === null) return urls;
        if (Array.isArray(obj)) {
          obj.forEach(item => {
             urls = urls.concat(extractStorageUrls(item));
          });
          return urls;
        }
        if (typeof obj === "object") {
          Object.values(obj).forEach(val => {
            if (typeof val === "string" && val.includes("firebasestorage.googleapis.com")) {
              urls.push(val);
            } else {
              urls = urls.concat(extractStorageUrls(val));
            }
          });
        }
        return urls;
      };

      // Upsert current items
      let writes = 0;
      await Promise.all(items.map(async (item) => {
        const id = getId(item);
        const docRef = doc(db, collectionName, id);
        
        const oldDoc = existingDocs.docs.find(d => d.id === id);
        const oldData = oldDoc ? oldDoc.data() : null;
        
        const processedItem = await ImageService.uploadAllImagesInObject(item, collectionName, id);
        const sanitizedNewData = sanitizeForFirestore(processedItem);
        
        if (oldData) {
          const oldUrls = extractStorageUrls(oldData);
          const newUrls = extractStorageUrls(sanitizedNewData);
          const orphanedUrls = oldUrls.filter(url => !newUrls.includes(url));
          await Promise.all(orphanedUrls.map(url => ImageService.deleteImageFromStorage(url)));
          
          // Only write if data actually changed
          if (deepEqual(oldData, sanitizedNewData)) {
             return;
          }
        }

        batch.set(docRef, sanitizedNewData);
        writes++;
      }));
      if (writes > 0) await batch.commit();
      
    } catch (error) {
      console.error(`Error saving collection ${collectionName}:`, error);
    }
  },

  async deleteDocument(collectionName: string, id: string) {
    try {
      const docRef = doc(db, collectionName, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        await ImageService.deleteAllImagesInObject(data);
        await deleteDoc(docRef);
      }
    } catch (error) {
      console.error(`Error deleting document ${id} from ${collectionName}:`, error);
      throw error;
    }
  },

  // Business Settings
  getBusinessSettings: async (): Promise<BusinessSettings | null> => {
    try {
      const docRef = doc(db, "settings", "business");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as BusinessSettings;
      }
    } catch (error) {
      console.error("Error fetching business settings:", error);
    }
    return null;
  },
  saveBusinessSettings: async (settings: BusinessSettings) => {
    try {
      const docRef = doc(db, "settings", "business");
      const docSnap = await getDoc(docRef);
      const oldData = docSnap.exists() ? docSnap.data() : null;

      const processedSettings = await ImageService.uploadAllImagesInObject(settings, "settings", "business");

      const sanitizedSettings = sanitizeForFirestore(processedSettings);

      if (oldData) {
        if (deepEqual(oldData, sanitizedSettings)) {
           return;
        }

        const extractStorageUrls = (obj: any): string[] => {
          let urls: string[] = [];
          if (obj === undefined || obj === null) return urls;
          if (Array.isArray(obj)) {
            obj.forEach(item => { urls = urls.concat(extractStorageUrls(item)); });
            return urls;
          }
          if (typeof obj === "object") {
            Object.values(obj).forEach(val => {
              if (typeof val === "string" && val.includes("firebasestorage.googleapis.com")) {
                urls.push(val);
              } else {
                urls = urls.concat(extractStorageUrls(val));
              }
            });
          }
          return urls;
        };
        const oldUrls = extractStorageUrls(oldData);
        const newUrls = extractStorageUrls(processedSettings);
        const orphanedUrls = oldUrls.filter(url => !newUrls.includes(url));
        await Promise.all(orphanedUrls.map(url => ImageService.deleteImageFromStorage(url)));
      }

      await setDoc(
        docRef,
        sanitizedSettings,
      );
    } catch (error) {
      console.error(
        "Error while saving business settings:",
        error,
      );
      alert("Failed to save settings. If you uploaded an image, check limits.");
    }
  },

  // Batches
  getBatches: async (): Promise<Batch[]> => {
    return await StorageService.fetchCollection<Batch>("batches");
  },
  saveBatches: async (batches: Batch[]) => {
    await StorageService.saveCollection(
      "batches",
      batches,
      (b) => b.id || b.batchNumber.toString(),
    );
  },

  // Custom Groups
  getGroups: async (): Promise<CustomGroup[]> => {
    return await StorageService.fetchCollection<CustomGroup>("customGroups");
  },
  saveGroups: async (groups: CustomGroup[]) => {
    await StorageService.saveCollection(
      "customGroups",
      groups,
      (g) => g.batchId,
    );
  },

  // Users (Accounts)
  getAccounts: async (): Promise<Customer[]> => {
    return await StorageService.fetchCollection<Customer>("customers");
  },
  saveAccounts: async (accounts: Customer[]) => {
    await StorageService.saveCollection("customers", accounts, (a) => a.email);
  },

  // Active Session (keep in localStorage for auth persistence)
  getSession: (): Customer | null => {
    const saved = localStorage.getItem("ntcc_user");
    return StorageService.safeParse<Customer>(saved);
  },
  saveSession: (user: Customer) => {
    localStorage.setItem("ntcc_user", JSON.stringify(user));
  },
  clearSession: () => {
    localStorage.removeItem("ntcc_user");
  },

  // Fabrics
  getFabrics: async (): Promise<Fabric[]> => {
    return await StorageService.fetchCollection<Fabric>("fabrics");
  },
  previewNextFabricCode: async (): Promise<string> => {
    const seqRef = doc(db, "settings", "fabricSequence");
    const seqDoc = await getDoc(seqRef);
    let nextCodeNum = 1;
    
    if (!seqDoc.exists()) {
      // If the sequence document doesn't exist, we fallback to querying the highest current code.
      const existingDocs = await getDocs(collection(db, "fabrics"));
      let maxNum = 0;
      existingDocs.forEach(d => {
        const codeStr = d.data().code;
        if (codeStr && codeStr.startsWith("ODG-")) {
          const num = parseInt(codeStr.substring(4), 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
      nextCodeNum = maxNum + 1;
    } else {
      nextCodeNum = (seqDoc.data().current || 0) + 1;
    }

    return `ODG-${String(nextCodeNum).padStart(3, "0")}`;
  },
  saveFabrics: async (fabrics: Fabric[]) => {
    await StorageService.saveCollection("fabrics", fabrics, (f) => f.id || f.code);
  },

  // Styles
  getStyles: async (): Promise<StyleCategory[]> => {
    return await StorageService.fetchCollection<StyleCategory>("styles");
  },
  saveStyles: async (styles: StyleCategory[]) => {
    await StorageService.saveCollection("styles", styles, (s) => s.id);
  },

  // Showpieces (Gallery)
  getShowpieces: async (): Promise<Showpiece[]> => {
    return await StorageService.fetchCollection<Showpiece>("showpieces");
  },
  saveShowpieces: async (showpieces: Showpiece[]) => {
    await StorageService.saveCollection("showpieces", showpieces, (s) => s.id);
  },

  // Community Photos
  getCommunityPhotos: async (): Promise<CommunityPhoto[]> => {
    return await StorageService.fetchCollection<CommunityPhoto>(
      "communityPhotos",
    );
  },
  saveCommunityPhotos: async (photos: CommunityPhoto[]) => {
    await StorageService.saveCollection("communityPhotos", photos, (p) => p.id);
  },

  // Orders
  getOrders: async (): Promise<MasterOrder[]> => {
    return await StorageService.fetchCollection<MasterOrder>("orders");
  },
  saveOrders: async (orders: MasterOrder[]) => {
    await StorageService.saveCollection(
      "orders",
      orders,
      (o) => o.shipment?.trackingId || Date.now().toString(),
    );
  },

  // Joined Batch IDs (keep in local storage as it's user-specific device state for the prototype without auth)
  getJoinedBatchIds: (): string[] | null => {
    const saved = localStorage.getItem("asml_joined_batch_ids");
    return StorageService.safeParse<string[]>(saved);
  },
  saveJoinedBatchIds: (ids: string[]) => {
    localStorage.setItem("asml_joined_batch_ids", JSON.stringify(ids));
  },
};
