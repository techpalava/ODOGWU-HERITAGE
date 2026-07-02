const fs = require('fs');
let code = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

const junkStart = '        const updated = [...accounts, existingAcc];\n        setAccounts(updated);\n        localStorage.setItem("asml_accounts", JSON.stringify(updated));';
const junkEnd = '    }, 1200);\n  };\n';

const idxStart = code.indexOf(junkStart);
const idxEnd = code.indexOf(junkEnd) + junkEnd.length;

if (idxStart !== -1 && idxEnd !== -1) {
  code = code.substring(0, idxStart) + code.substring(idxEnd);
  fs.writeFileSync('src/components/LoginView.tsx', code);
  console.log("Cleaned up junk!");
} else {
  console.log("Could not find junk");
}
