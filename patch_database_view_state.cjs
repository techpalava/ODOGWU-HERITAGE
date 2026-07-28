const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const regexStore = /currentUser,\n    mediaLibrary,/;
content = content.replace(regexStore, `currentUser,
    customDetailCatalog,
    setCustomDetailCatalog,
    mediaLibrary,`);

const regexSubTab = /const \[styleSearch, setStyleSearch\] = useState\(""\);/;
content = content.replace(regexSubTab, `const [styleSubTab, setStyleSubTab] = useState<"styles" | "catalogue">("styles");
  const [styleSearch, setStyleSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [editingCatalogOption, setEditingCatalogOption] = useState<any>(null);
  const [isNewCatalogOption, setIsNewCatalogOption] = useState(false);`);

fs.writeFileSync('src/components/DatabaseView.tsx', content);
