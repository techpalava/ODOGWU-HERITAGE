const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

code = code.replace(/className="hidden md:block bg-white border border-heritage-gold\/15 p-4 sm:p-5 rounded-2xl shadow-sm select-none"/, 'className="hidden md:block bg-white border border-heritage-gold/15 py-3.5 px-5 rounded-2xl shadow-sm select-none"');
code = code.replace(/className="flex justify-between items-end mb-3"/, 'className="flex justify-between items-end mb-2.5"');
code = code.replace(/className="h-1 w-full bg-heritage-cream rounded-full overflow-hidden mb-4"/, 'className="h-1 w-full bg-heritage-cream rounded-full overflow-hidden mb-3"');
code = code.replace(/className={\`flex flex-col items-start gap-1 transition-colors duration-200 focus:outline-none w-14/g, 'className={`flex flex-col items-start gap-0.5 transition-colors duration-200 focus:outline-none w-14');

fs.writeFileSync('src/components/DesignStudioView.tsx', code);
