const fs = require('fs');
let content = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

const startStr = '// Complete Google Account Creation';
const endStr = '      // Fallback';
// wait, we need to remove the whole function, up to the end of it.
// let's just find the index.

const idxStart = content.indexOf(startStr);
if (idxStart !== -1) {
    let bracketCount = 0;
    let started = false;
    let idxEnd = -1;
    for (let i = idxStart; i < content.length; i++) {
        if (content[i] === '{') {
            bracketCount++;
            started = true;
        } else if (content[i] === '}') {
            bracketCount--;
        }
        if (started && bracketCount === 0) {
            idxEnd = i;
            break;
        }
    }
    
    if (idxEnd !== -1) {
        content = content.substring(0, idxStart) + content.substring(idxEnd + 1);
    }
}

content = content.replace(/import \{ motion, AnimatePresence \} from "motion\/react";/, 'import { motion } from "motion/react";');
content = content.replace(/ChevronRight,?\s*/, '');
content = content.replace(/const \[customGoogleEmail, setCustomGoogleEmail\] = useState\(""\);\n/g, '');
content = content.replace(/const \[googleStep.*?;\n/g, '');

fs.writeFileSync('src/components/LoginView.tsx', content);
