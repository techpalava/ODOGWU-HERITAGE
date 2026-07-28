import { db } from './firebase';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { CustomDetailOption } from '../types';
import { SEED_CUSTOM_DETAIL_CATALOG } from '../config/GarmentDetailsConfig';

const CATALOG_COLLECTION = 'custom_detail_catalog';

export const CatalogService = {
  async getCatalog(): Promise<CustomDetailOption[]> {
    try {
      const querySnapshot = await getDocs(collection(db, CATALOG_COLLECTION));
      const catalog: CustomDetailOption[] = [];
      querySnapshot.forEach((doc) => {
        catalog.push(doc.data() as CustomDetailOption);
      });
      
      if (catalog.length === 0) {
        console.warn('Catalog empty, falling back to seed...');
        // Optional: seed the catalog in DB if empty? The prompt says: "Do not overwrite valid saved catalogue data automatically", but if empty, maybe just return seed.
        return SEED_CUSTOM_DETAIL_CATALOG;
      }
      return catalog;
    } catch (e) {
      console.error('Failed to load catalog, using fallback', e);
      return SEED_CUSTOM_DETAIL_CATALOG;
    }
  },

  async saveOption(option: CustomDetailOption): Promise<void> {
    try {
      await setDoc(doc(db, CATALOG_COLLECTION, option.id), option);
    } catch (e) {
      console.error('Failed to save catalog option', e);
      throw e;
    }
  },

  async seedCatalog(): Promise<void> {
    try {
       const batch = writeBatch(db);
       for (const opt of SEED_CUSTOM_DETAIL_CATALOG) {
         const d = doc(db, CATALOG_COLLECTION, opt.id);
         batch.set(d, opt);
       }
       await batch.commit();
    } catch (e) {
      console.error('Failed to seed catalog', e);
      throw e;
    }
  }
};
