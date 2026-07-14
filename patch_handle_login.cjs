const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const oldCode = `  const handleLogin = (email: string, name: string, phone?: string) => {
    const user: Customer = { email, name, phone: phone || "", location: "" };
    setCurrentUser(user);
    StorageService.saveSession(user);`;

const newCode = `  const handleLogin = (email: string, name: string, phone?: string) => {
    // Find the full user profile from the database
    let user = store.customers.find(
      (c) => (c.email || "").trim().toLowerCase() === email.trim().toLowerCase()
    );
    // If somehow not found (e.g. simulated phone login missing), fallback
    if (!user) {
      user = { email, name, phone: phone || "", location: "" } as Customer;
    }
    
    // In case the role is not correctly resolved yet, we could resolve it, 
    // but the app store should have it. To be safe, we assign it.
    user.role = AuthorizationEngine.resolveRole(user);
    
    setCurrentUser(user);
    StorageService.saveSession(user);`;

if (!code.includes("store.customers.find")) { // Check to ensure not patched
    code = code.replace(oldCode, newCode);
    
    // We also need to make sure AuthorizationEngine is imported in App.tsx
    if (!code.includes('AuthorizationEngine')) {
        code = code.replace(
            'import { CustomerJourneyEngine } from "./engine/CustomerJourneyEngine";',
            'import { CustomerJourneyEngine } from "./engine/CustomerJourneyEngine";\nimport { AuthorizationEngine } from "./engine/AuthorizationEngine";'
        );
    }
    
    fs.writeFileSync('src/App.tsx', code);
    console.log('App.tsx patched');
}
