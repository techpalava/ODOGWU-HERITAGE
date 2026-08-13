import { db } from './firebase';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { CustomDetailOption } from '../types';
import { SEED_CUSTOM_DETAIL_CATALOG } from '../config/GarmentDetailsConfig';
import {
  attachCustomDetailCatalogDocumentId,
  createCustomDetailCatalogTombstone,
  normalizeCustomDetailCatalog,
} from '../utils/catalogHelpers';

const CATALOG_COLLECTION = 'custom_detail_catalog';

export const CatalogService = {
  async getCatalog(): Promise<CustomDetailOption[]> {
    try {
      const querySnapshot = await getDocs(collection(db, CATALOG_COLLECTION));
      const catalog: unknown[] = [];
      querySnapshot.forEach((catalogDocument) => {
        catalog.push(
          attachCustomDetailCatalogDocumentId(
            catalogDocument.id,
            catalogDocument.data(),
          ),
        );
      });
      
      if (catalog.length === 0) {
        console.warn('Catalog empty, falling back to seed...');
      }
      return normalizeCustomDetailCatalog(catalog);
    } catch (e) {
      console.error('Failed to load catalog, using fallback', e);
      return normalizeCustomDetailCatalog([]);
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

  async deleteOption(optionId: string): Promise<void> {
    try {
      const tombstone = createCustomDetailCatalogTombstone(optionId);
      await setDoc(
        doc(db, CATALOG_COLLECTION, tombstone.optionId),
        tombstone,
      );
    } catch (e) {
      console.error('Failed to delete catalog option', e);
      throw e;
    }
  },

  async seedCatalog(): Promise<void> {
    try {
       const existingSnapshot = await getDocs(
         collection(db, CATALOG_COLLECTION),
       );
       const existingIds = new Set(
         existingSnapshot.docs.map((catalogDocument) => catalogDocument.id),
       );
       const batch = writeBatch(db);
       for (const opt of SEED_CUSTOM_DETAIL_CATALOG) {
         if (existingIds.has(opt.id)) continue;
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
