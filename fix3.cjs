const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

code = code.replace(
    /                          <\/strong>\n                        <\/div>\n                        \n                      \{selectedReceipt\.design\.optionalAccessories/g,
    '                          </strong>\n                        </div>\n                      )}\n                      {selectedReceipt.design.optionalAccessories'
);

code = code.replace(
    /                          <\/strong>\n                        <\/div>\n                        \n                      <div>\n                        Agbada Cap:/g,
    '                          </strong>\n                        </div>\n                      )}\n                      <div>\n                        Agbada Cap:'
);

code = code.replace(
    /                        <\/strong>\n                      <\/div>\n                    <\/div>\n                    \n                  \{\/\* Sizing Blueprint summary \*\/\}/g,
    '                        </strong>\n                      </div>\n                    </div>\n                  )}\n                  {/* Sizing Blueprint summary */}'
);

fs.writeFileSync('src/components/DashboardView.tsx', code);
