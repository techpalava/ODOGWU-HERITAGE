const fs = require('fs');
let code = fs.readFileSync('src/components/AdminAuthGuard.tsx', 'utf8');

const oldBlock = `      if (!existingAcc) {
        existingAcc = {
          name: user.displayName || "Admin User",
          email: user.email || "",
          phone: user.phoneNumber || "",
          passcode: "1960", // Legacy compat
          role: AuthorizationEngine.isAdminEmail(user.email) ? AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR : "Verified Google Client", // Default role
          orderStatus: "Fresh Passport Activation",
          method: "gmail",
        } as any;
        setCustomers([...customers, existingAcc]);
      } else if (AuthorizationEngine.isAdminEmail(user.email)) {
        // Ensure role is updated if they are an admin
        existingAcc.role = AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR;
      }`;

const newBlock = `      if (!existingAcc) {
        existingAcc = {
          name: user.displayName || "Admin User",
          email: user.email || "",
          phone: user.phoneNumber || "",
          passcode: "1960", // Legacy compat
          role: AuthorizationEngine.resolveRole({ email: user.email } as any),
          orderStatus: "Fresh Passport Activation",
          method: "gmail",
        } as any;
        setCustomers([...customers, existingAcc]);
      } else {
        // Ensure role is updated
        existingAcc.role = AuthorizationEngine.resolveRole(existingAcc);
      }`;

if (code.includes(oldBlock)) {
    code = code.replace(oldBlock, newBlock);
    fs.writeFileSync('src/components/AdminAuthGuard.tsx', code);
    console.log('AdminAuthGuard.tsx updated for roles');
} else {
    console.log('oldBlock not found in AdminAuthGuard.tsx');
}
