const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

code = code.replace(/{stepTitles\.map\(\(_, idx\) => {/g, '{stepTitles.map((title, idx) => {');
code = code.replace(/<div className="hidden md:block bg-white border border-heritage-gold\/15 p-4 sm:p-5 rounded-2xl shadow-sm select-none">[\s\S]*?{stepTitles\.map\(\(title, idx\) => {/g, match => {
  return match.replace('{stepTitles.map((title, idx) => {', '{stepTitles.map((_title, idx) => {');
});
fs.writeFileSync('src/components/DesignStudioView.tsx', code);
