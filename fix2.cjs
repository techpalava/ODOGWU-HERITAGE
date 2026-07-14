const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');
code = code.replace(
    '                              </button>\n                            \n                          </div>',
    '                              </button>\n                            )}\n                          </div>'
);
fs.writeFileSync('src/components/DashboardView.tsx', code);
