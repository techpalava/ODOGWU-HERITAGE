const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const targetSelect = `                          className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        >
                          {fabricCategoryOptions.map((opt) => (`;

const repSelect = `                          className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        >
                          <option value="" disabled>Select fabric category</option>
                          {fabricCategoryOptions.map((opt) => (`;

content = content.replace(targetSelect, repSelect);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
