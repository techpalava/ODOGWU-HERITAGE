const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const target = `  const handleSaveStyle = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as StyleCategory;
    if (!item.id || !item.name) {
      alert("Style ID and Name are required.");
      return;
    }`;

const rep = `  const handleSaveStyle = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as StyleCategory;
    if (!item.id || !item.name) {
      alert("Style ID and Name are required.");
      return;
    }
    
    if (!item.targetDemographic && !item.gender) {
      alert("Target Demographic is required.");
      return;
    }
    
    if (item.customDetailConfig) {
      const conf = item.customDetailConfig;
      if (!conf.representedGenders || conf.representedGenders.length === 0) {
        alert("Represented genders must be assigned.");
        return;
      }
      if (conf.featuresMaleAndFemale && (!conf.representedGenders.includes('male') || !conf.representedGenders.includes('female'))) {
        alert("Features both male and female requires both male and female to be represented.");
        return;
      }
      if (conf.enabled && (!conf.supportedGarmentGroups || conf.supportedGarmentGroups.length === 0)) {
        alert("At least one supported garment group is required when Step 3 is enabled.");
        return;
      }
    }`;

content = content.replace(target, rep);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
