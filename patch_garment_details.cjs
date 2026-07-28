const fs = require('fs');
let content = fs.readFileSync('src/config/GarmentDetailsConfig.ts', 'utf8');

content = content.replace(/export interface GarmentDetailOption \{[\s\S]*?\}/, `import { CustomDetailOption } from '../types';`);

content = content.replace(/export const GARMENT_DETAIL_OPTIONS\: GarmentDetailOption\[\] = \[/, `export const SEED_CUSTOM_DETAIL_CATALOG: CustomDetailOption[] = [`);

content = content.replace(/garmentGroup: "shorts",/g, 'garmentGroup: "standard_shorts",');
content = content.replace(/selectionGroup: "shirt_length_sleeve"/g, 'selectionGroup: "shirt_construction"');
content = content.replace(/selectionGroup: "dress_length_sleeve"/g, 'selectionGroup: "dress_construction"');
content = content.replace(/selectionGroup: "standard_shorts"/g, 'selectionGroup: "standard_shorts_fastening"');
content = content.replace(/selectionGroup: "bum_shorts"/g, 'selectionGroup: "bum_shorts_fastening"');
content = content.replace(/selectionGroup: "trousers"/g, 'selectionGroup: "trouser_fastening"');
content = content.replace(/selectionGroup: "skirt"/g, 'selectionGroup: "skirt_length"');


// map each element of SEED_CUSTOM_DETAIL_CATALOG to add required new fields
let jsContent = content;
let replaced = jsContent.replace(/export const SEED_CUSTOM_DETAIL_CATALOG: CustomDetailOption\[\] = \[([\s\S]*?)\];/g, (match, arrayContent) => {
    
    // Just inject the new fields via regex replace of individual objects
    let newArrayContent = arrayContent.replace(/  \{([\s\S]*?)\}/g, (objMatch, objContent) => {
        let res = `  {${objContent}`;
        res = res.trim().replace(/,$/, '');
        res += `,
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }`;
        return res;
    });

    return `export const SEED_CUSTOM_DETAIL_CATALOG: CustomDetailOption[] = [\n${newArrayContent}\n];`;
});

fs.writeFileSync('src/config/GarmentDetailsConfig.ts', replaced);
