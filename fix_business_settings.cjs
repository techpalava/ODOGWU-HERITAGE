const fs = require('fs');
let code = fs.readFileSync('src/services/storageService.ts', 'utf8');

const match = `
      if (oldData) {
        const extractStorageUrls = (obj: any): string[] => {
          let urls: string[] = [];
`;

const replacement = `
      const sanitizedSettings = sanitizeForFirestore(processedSettings);

      if (oldData) {
        if (deepEqual(oldData, sanitizedSettings)) {
           return;
        }

        const extractStorageUrls = (obj: any): string[] => {
          let urls: string[] = [];
`;

code = code.replace(match, replacement);

const match2 = `
      await setDoc(
        docRef,
        sanitizeForFirestore(processedSettings),
      );
`;

const replacement2 = `
      await setDoc(
        docRef,
        sanitizedSettings,
      );
`;
code = code.replace(match2, replacement2);
fs.writeFileSync('src/services/storageService.ts', code);
