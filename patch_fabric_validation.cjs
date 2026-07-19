const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const targetSave = `    if (!item.code || !item.name) {
      console.log("[handleSaveFabric] Missing code or name. code:", item.code, "name:", item.name);
      triggerStatus("Fabric Code and Name are required.", "error");
      return;
    }`;

const repSave = `    if (!item.code || !item.name) {
      console.log("[handleSaveFabric] Missing code or name. code:", item.code, "name:", item.name);
      triggerStatus("Fabric Code and Name are required.", "error");
      return;
    }
    
    if (!item.category) {
      triggerStatus("Fabric Category is required. Please select an allowed category.", "error");
      return;
    }`;

content = content.replace(targetSave, repSave);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
