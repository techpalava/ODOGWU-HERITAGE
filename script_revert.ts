import fs from 'fs';
import path from 'path';

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

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            replaceInFile(fullPath, [
                [/Corporate/g, 'ASML'],
                [/ASML Campus/g, 'ASML Veldhoven']
            ]);
        }
    }
}

processDirectory('./src');
