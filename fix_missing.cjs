const fs = require('fs');

function addStoreImport(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add import if missing
    if (!content.includes('import { useAppStore }')) {
        content = content.replace(/(import React.*?;\n)/, '$1import { useAppStore } from "../store/useAppStore";\n');
    }
    
    // Add destructuring if missing
    if (!content.includes('businessSettings } = useAppStore();')) {
        // Find the export default function ... {
        const regex = /(export default function [A-Za-z0-9_]+\s*\([^)]*\)\s*\{)/;
        content = content.replace(regex, '$1\n  const { businessSettings } = useAppStore();\n');
    }
    
    fs.writeFileSync(filePath, content);
    console.log('Fixed', filePath);
}

addStoreImport('src/components/DashboardView.tsx');
addStoreImport('src/components/HomeView.tsx');
addStoreImport('src/components/MobileMenu.tsx');
