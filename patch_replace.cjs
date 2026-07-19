const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

content = content.replace(/\{useReferenceDataFallback\("genders", \[\s*\{ value: "male", label: "Male" \},\s*\{ value: "female", label: "Female" \},\s*\{ value: "unisex", label: "Unisex" \},\s*\{ value: "couple", label: "Couple" \},\s*\{ value: "family", label: "Family" \},\s*\]\)\.map/g, '{genderOptions.map');

content = content.replace(/\{useReferenceDataFallback\("genders", \[\s*\{ value: "male", label: "Men's Collection" \},\s*\{ value: "female", label: "Women's Collection" \},\s*\{ value: "unisex", label: "Unisex Collection" \},\s*\{ value: "family", label: "Family Collection" \},\s*\]\)\.map/g, '{genderOptionsCollection.map');

content = content.replace(/\{useReferenceDataFallback\("outfit_types", \[\s*\{ value: "Senator Set", label: "Senator Set" \},\s*\{ value: "Kaftan Set", label: "Kaftan Set" \},\s*\{ value: "Boubou", label: "Boubou" \},\s*\{ value: "Agbada", label: "Agbada" \},\s*\]\)\.map/g, '{outfitTypeOptions.map');

content = content.replace(/\{useReferenceDataFallback\("garment_compositions", \[\s*\{ value: "Shirt Only", label: "Shirt Only" \},\s*\{ value: "Trouser Only", label: "Trouser Only" \},\s*\{ value: "Shorts Only", label: "Shorts Only" \},\s*\{ value: "Blouse Only", label: "Blouse Only" \},\s*\{ value: "Top Only", label: "Top Only" \},\s*\{ value: "Dress Only", label: "Dress Only" \},\s*\{ value: "2-Piece Set", label: "2-Piece Set" \},\s*\{ value: "3-Piece Set", label: "3-Piece Set" \},\s*\{ value: "4-Piece Set", label: "4-Piece Set" \},\s*\]\)\.map/g, '{garmentCompositionOptions.map');

content = content.replace(/\{useReferenceDataFallback\("fabric_categories", \[\s*\{ value: "HiTarget Ankara", label: "HiTarget Ankara" \},\s*\{ value: "Hollandis Ankara", label: "Hollandis Ankara" \},\s*\{ value: "Kampala", label: "Kampala" \},\s*\{ value: "Aso-Oke", label: "Aso-Oke" \},\s*\{ value: "Adire", label: "Adire" \},\s*\{ value: "Guinea Brocade", label: "Guinea Brocade" \},\s*\{ value: "Atiku", label: "Atiku" \},\s*\{ value: "Lace", label: "Lace" \},\s*\{ value: "Senator Material", label: "Senator Material" \},\s*\{ value: "Polish Cotton", label: "Polish Cotton" \},\s*\{ value: "Silk", label: "Silk" \},\s*\{ value: "Crepe", label: "Crepe" \},\s*\{ value: "Chiffon", label: "Chiffon" \},\s*\{ value: "Damask", label: "Damask" \},\s*\{ value: "Velvet", label: "Velvet" \},\s*\]\)\.map/g, '{fabricCategoryOptions.map');

fs.writeFileSync('src/components/DatabaseView.tsx', content);
