const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const regex = /                  \)\)\}\n                <\/div>\n                \)\}/;

const replacement = `                  ))}
                </div>
                </div>
                )}`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
