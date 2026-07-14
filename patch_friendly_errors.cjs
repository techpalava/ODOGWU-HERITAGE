const fs = require('fs');

const errorHandlingBlock = `let friendlyMessage = "Google login failed. Please try again or contact support.";
      if (err.code === "auth/unauthorized-domain") {
        friendlyMessage = "Google login is not authorized for this website domain yet. Please contact support.";
      } else if (err.code === "auth/operation-not-allowed") {
        friendlyMessage = "Google login is not enabled yet. Please contact support.";
      } else if (err.code === "auth/popup-blocked") {
        friendlyMessage = "Your browser blocked the Google login window. Please allow popups and try again.";
      } else if (err.code === "auth/popup-closed-by-user") {
        friendlyMessage = "Google login was cancelled. Please try again.";
      } else if (err.code === "auth/network-request-failed") {
        friendlyMessage = "Network issue. Please check your connection and try again.";
      }
      setError(friendlyMessage);`;

const loginViewPath = 'src/components/LoginView.tsx';
let loginViewCode = fs.readFileSync(loginViewPath, 'utf8');
loginViewCode = loginViewCode.replace(
  /setError\(err\.message \|\| "Failed to authenticate with Google\."\);/,
  errorHandlingBlock
);
fs.writeFileSync(loginViewPath, loginViewCode);
console.log('LoginView.tsx updated');

const adminGuardPath = 'src/components/AdminAuthGuard.tsx';
let adminGuardCode = fs.readFileSync(adminGuardPath, 'utf8');
adminGuardCode = adminGuardCode.replace(
  /setError\(err\.message \|\| "Failed to authenticate with Google\."\);/,
  errorHandlingBlock
);
fs.writeFileSync(adminGuardPath, adminGuardCode);
console.log('AdminAuthGuard.tsx updated');
