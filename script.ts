import fs from 'fs';

let content = fs.readFileSync('src/data/mockData.ts', 'utf8');

// replace colorName with nothing (it's duplicated by color: "...")
content = content.replace(/    colorName: "[^"]*",\n/g, '');
// there's a dynamic one: colorName: color.name,
content = content.replace(/    colorName: color\.name,\n/g, '');

content = content.replace(/    texture: "[^"]*",\n/g, '');
content = content.replace(/    manufacturer: "[^"]*",\n/g, '');

fs.writeFileSync('src/data/mockData.ts', content);

let foundation = fs.readFileSync('src/data/foundationMockData.ts', 'utf8');
foundation = foundation.replace(/    colorName: "[^"]*",\n/g, '');
foundation = foundation.replace(/    texture: "[^"]*",\n/g, '');
foundation = foundation.replace(/    manufacturer: "[^"]*",\n/g, '');
fs.writeFileSync('src/data/foundationMockData.ts', foundation);
