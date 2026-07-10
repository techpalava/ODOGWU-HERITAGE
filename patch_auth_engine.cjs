const fs = require('fs');
let content = fs.readFileSync('src/engine/AuthorizationEngine.ts', 'utf8');

const target = `  // Helper to resolve the role of the user, defaults to Guest
  static resolveRole(user: Customer | null): string {
    if (!user) return AuthorizationEngine.ROLES.GUEST;
    // Handle mock legacy roles mapping to our enterprise roles
    const legacyRole = user.role?.toLowerCase() || "";
    if (legacyRole.includes("admin")) return AuthorizationEngine.ROLES.ADMINISTRATOR;
    if (legacyRole.includes("super")) return AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR;
    if (legacyRole.includes("tailor") || legacyRole.includes("production")) return AuthorizationEngine.ROLES.PRODUCTION_MANAGER;
    if (legacyRole.includes("community")) return AuthorizationEngine.ROLES.COMMUNITY_COORDINATOR;
    if (legacyRole.includes("verified google client")) return AuthorizationEngine.ROLES.CUSTOMER;
    
    // Default valid authenticated users to Customer
    return AuthorizationEngine.ROLES.CUSTOMER;
  }`;

const replacement = `  static ALLOWED_ADMIN_EMAILS = [
    "techpalavabox@gmail.com",
    "f.o.startups@gmail.com",
    "vaprecfamily@gmail.com",
    "milltechbox@gmail.com"
  ];

  static isAdminEmail(email?: string): boolean {
    if (!email) return false;
    return this.ALLOWED_ADMIN_EMAILS.includes(email.trim().toLowerCase());
  }

  // Helper to resolve the role of the user, defaults to Guest
  static resolveRole(user: Customer | null): string {
    if (!user) return AuthorizationEngine.ROLES.GUEST;
    
    // Enforce admin access strictly based on email allowlist
    if (this.isAdminEmail(user.email)) {
      return AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR;
    }
    
    // Default all other users to Customer, regardless of legacy labels
    return AuthorizationEngine.ROLES.CUSTOMER;
  }`;

content = content.replace(target, replacement);
fs.writeFileSync('src/engine/AuthorizationEngine.ts', content);
