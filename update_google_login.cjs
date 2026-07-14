const fs = require('fs');
let code = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

const oldFind = `let existingAcc = accounts.find(
        (acc) => acc.email.toLowerCase() === (user.email || "").toLowerCase(),
      );`;

const newFind = `let existingAcc = accounts.find(
        (acc) => (acc.email || "").trim().toLowerCase() === (user.email || "").trim().toLowerCase(),
      );`;

if (code.includes(oldFind)) {
    code = code.replace(oldFind, newFind);
    fs.writeFileSync('src/components/LoginView.tsx', code);
    console.log('LoginView.tsx updated');
} else {
    console.log('oldFind not found in LoginView.tsx');
}
