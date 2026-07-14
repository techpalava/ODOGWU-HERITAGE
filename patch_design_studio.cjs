const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regex = /\s*\{\/\* Journey Engine Context Notification \*\/\}.*?\{\/\* 9-step progress visualizer \*\/\}/s;
const match = code.match(regex);
if (match) {
    console.log("Found match");
    code = code.replace(regex, '\n\n      {/* 9-step progress visualizer */}');
    fs.writeFileSync('src/components/DesignStudioView.tsx', code);
    console.log('Patched');
} else {
    console.log("Not found");
}
