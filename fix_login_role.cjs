const fs = require('fs');
let code = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

const oldBlock = `      if (!existingAcc) {
        existingAcc = {
          name: user.displayName || "Google User",
          email: user.email || "",
          phone: user.phoneNumber || "",
          passcode: "1960",
          role: AuthorizationEngine.isAdminEmail(user.email) ? AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR : "Verified Google Client",
          orderStatus: "Fresh Passport Activation",
          method: "gmail",
        } as any;
        const updated = [...accounts, existingAcc];
        setAccounts(updated);
      } else if (AuthorizationEngine.isAdminEmail(user.email)) {
        existingAcc.role = AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR;
      }`;

const newBlock = `      if (!existingAcc) {
        existingAcc = {
          name: user.displayName || "Google User",
          email: user.email || "",
          phone: user.phoneNumber || "",
          passcode: "1960",
          role: AuthorizationEngine.resolveRole({ email: user.email } as any),
          orderStatus: "Fresh Passport Activation",
          method: "gmail",
        } as any;
        const updated = [...accounts, existingAcc];
        setAccounts(updated);
      } else {
        existingAcc.role = AuthorizationEngine.resolveRole(existingAcc);
      }`;

if (code.includes(oldBlock)) {
    code = code.replace(oldBlock, newBlock);
    fs.writeFileSync('src/components/LoginView.tsx', code);
    console.log('LoginView.tsx updated for roles');
} else {
    console.log('oldBlock not found in LoginView.tsx');
}
