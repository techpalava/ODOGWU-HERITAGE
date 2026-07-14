const fs = require('fs');
let lines = fs.readFileSync('src/components/DashboardView.tsx', 'utf8').split('\n');

// 666,23): error TS1005: ')' expected. -> It means before line 666 we need )}
lines[664] = '                      )}';

// 682,21): error TS1005: ')' expected. -> Before line 682? Wait, let's check line 673
lines[672] = '                      )}';

// 685,19): error TS1005: ')' expected. -> Before line 685
lines[683] = '                  )}';

fs.writeFileSync('src/components/DashboardView.tsx', lines.join('\n'));
