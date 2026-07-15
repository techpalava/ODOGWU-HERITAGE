const fs = require('fs');
let code = fs.readFileSync('src/services/storageService.ts', 'utf8');

// We will add a deepEqual check to saveCollection
const deepEqualCode = `
function deepEqual(a, b) {
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
`;

code = code.replace('function sanitizeForFirestore(val: any): any {', deepEqualCode + '\nfunction sanitizeForFirestore(val: any): any {');

const saveCollectionMatch = `
      // Upsert current items
      await Promise.all(items.map(async (item) => {
        const id = getId(item);
        const docRef = doc(db, collectionName, id);
        
        const oldDoc = existingDocs.docs.find(d => d.id === id);
        const oldData = oldDoc ? oldDoc.data() : null;
        
        const processedItem = await ImageService.uploadAllImagesInObject(item, collectionName, id);
        
        if (oldData) {
          const oldUrls = extractStorageUrls(oldData);
          const newUrls = extractStorageUrls(processedItem);
          const orphanedUrls = oldUrls.filter(url => !newUrls.includes(url));
          await Promise.all(orphanedUrls.map(url => ImageService.deleteImageFromStorage(url)));
        }

        batch.set(docRef, sanitizeForFirestore(processedItem));
      }));
`;

const saveCollectionReplacement = `
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
      
      if (writes > 0) {
        await batch.commit();
      }
`;

code = code.replace(saveCollectionMatch, saveCollectionReplacement);
fs.writeFileSync('src/services/storageService.ts', code);
