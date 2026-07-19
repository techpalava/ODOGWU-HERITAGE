const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const oldFabricOptions = `  const fabricCategoryOptions = useReferenceDataFallback("fabric_categories", [
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
  ]);`;

const newFabricOptions = `  const fabricCategoryOptions = useReferenceDataFallback("fabric_categories", [
    { value: "HiTarget Ankara", label: "HiTarget Ankara" },
    { value: "Hollandis Ankara", label: "Hollandis Ankara" },
    { value: "Kampala", label: "Kampala" },
    { value: "Aso-Oke", label: "Aso-Oke" },
    { value: "Adire", label: "Adire" },
    { value: "Isiagu (Akwa-Oche)", label: "Isiagu (Akwa-Oche)" },
    { value: "Lace", label: "Lace" },
  ]);`;

content = content.replace(oldFabricOptions, newFabricOptions);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
