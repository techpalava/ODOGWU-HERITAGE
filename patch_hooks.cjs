const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const hooks = `  const genderOptions = useReferenceDataFallback("genders", [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "unisex", label: "Unisex" },
    { value: "couple", label: "Couple" },
    { value: "family", label: "Family" },
  ]);

  const genderOptionsCollection = useReferenceDataFallback("genders", [
    { value: "male", label: "Men's Collection" },
    { value: "female", label: "Women's Collection" },
    { value: "unisex", label: "Unisex Collection" },
    { value: "family", label: "Family Collection" },
  ]);

  const outfitTypeOptions = useReferenceDataFallback("outfit_types", [
    { value: "Senator Set", label: "Senator Set" },
    { value: "Kaftan Set", label: "Kaftan Set" },
    { value: "Boubou", label: "Boubou" },
    { value: "Agbada", label: "Agbada" },
  ]);

  const garmentCompositionOptions = useReferenceDataFallback("garment_compositions", [
    { value: "Shirt Only", label: "Shirt Only" },
    { value: "Trouser Only", label: "Trouser Only" },
    { value: "Shorts Only", label: "Shorts Only" },
    { value: "Blouse Only", label: "Blouse Only" },
    { value: "Top Only", label: "Top Only" },
    { value: "Dress Only", label: "Dress Only" },
    { value: "2-Piece Set", label: "2-Piece Set" },
    { value: "3-Piece Set", label: "3-Piece Set" },
    { value: "4-Piece Set", label: "4-Piece Set" },
  ]);

  const fabricCategoryOptions = useReferenceDataFallback("fabric_categories", [
    { value: "HiTarget Ankara", label: "HiTarget Ankara" },
    { value: "Hollandis Ankara", label: "Hollandis Ankara" },
    { value: "Kampala", label: "Kampala" },
    { value: "Aso-Oke", label: "Aso-Oke" },
    { value: "Adire", label: "Adire" },
    { value: "Guinea Brocade", label: "Guinea Brocade" },
    { value: "Atiku", label: "Atiku" },
    { value: "Lace", label: "Lace" },
    { value: "Senator Material", label: "Senator Material" },
    { value: "Polish Cotton", label: "Polish Cotton" },
    { value: "Silk", label: "Silk" },
    { value: "Crepe", label: "Crepe" },
    { value: "Chiffon", label: "Chiffon" },
    { value: "Damask", label: "Damask" },
    { value: "Velvet", label: "Velvet" },
  ]);

  const [activeTab, setActiveTab] = useState<TabType>("documentation");`;

content = content.replace('  const [activeTab, setActiveTab] = useState<TabType>("documentation");', hooks);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
