const fs = require('fs');
const lines = fs.readFileSync('src/components/HomeView.tsx', 'utf8').split('\n');
const newLines = [];
let found = false;

for (let i = 0; i < lines.length; i++) {
  newLines.push(lines[i]);
  if (!found && lines[i].includes('              })()}')) {
    if (lines[i + 1].trim() === '</div>' && lines[i + 2].trim() === '</div>' && lines[i + 3].trim() === '</div>') {
      newLines.push(lines[i + 1]);
      newLines.push('            )}');
      i++; // skip line[i+1] since we pushed it
      found = true;
    }
  }
}

fs.writeFileSync('src/components/HomeView.tsx', newLines.join('\n'));
