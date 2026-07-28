const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regex = /export const getConstructionSewingCost = \(details: DesignSelections\): number => {/;
const replacement = `export const getConstructionSewingCost = (details: DesignSelections): number => {
  if (details.customDetails && Object.keys(details.customDetails).length > 0) {
    return 0; // New custom details pricing already includes construction cost
  }`;
content = content.replace(regex, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
