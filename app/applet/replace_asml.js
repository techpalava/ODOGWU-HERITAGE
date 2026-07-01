const fs = require('fs');
const glob = require('glob');

function replaceInFile(filePath, replacements) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = content;
    for (const [search, replace] of replacements) {
        modified = modified.replace(new RegExp(search, 'g'), replace);
    }
    if (modified !== content) {
        fs.writeFileSync(filePath, modified);
        console.log('Modified', filePath);
    }
}

// Mock data replacements
replaceInFile('src/data/mockData.ts', [
    ['ASML Veldhoven Campus', 'Corporate Campus Lockers']
]);
