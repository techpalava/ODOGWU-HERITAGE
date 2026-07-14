const fs = require('fs');
let code = fs.readFileSync('src/components/AdminAuthGuard.tsx', 'utf8');

const oldFind = `let existingAcc = customers.find(
        (acc) => acc.email.toLowerCase() === (user.email || "").toLowerCase(),
      );`;

const newFind = `let existingAcc = customers.find(
        (acc) => (acc.email || "").trim().toLowerCase() === (user.email || "").trim().toLowerCase(),
      );`;

if (code.includes(oldFind)) {
    code = code.replace(oldFind, newFind);
    fs.writeFileSync('src/components/AdminAuthGuard.tsx', code);
    console.log('AdminAuthGuard.tsx updated');
} else {
    console.log('oldFind not found in AdminAuthGuard.tsx');
}
