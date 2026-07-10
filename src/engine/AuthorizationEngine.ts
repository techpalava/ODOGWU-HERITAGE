import { Customer } from "../types";

export class AuthorizationEngine {
  // Base role definitions (future expansion should load this dynamically)
  static readonly ROLES = {
    GUEST: "Guest",
    CUSTOMER: "Customer",
    TAILOR: "Tailor",
    COMMUNITY_COORDINATOR: "Community Coordinator",
    PRODUCTION_MANAGER: "Production Manager",
    ADMINISTRATOR: "Administrator",
    SUPER_ADMINISTRATOR: "Super Administrator",
  };

  static ALLOWED_ADMIN_EMAILS = [
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
  }

  // --- Public Permissions API ---

  static canViewPublicPages(_user: Customer | null): boolean {
    return true; // Everyone
  }

  static canViewDesignStudio(_user: Customer | null): boolean {
    return true; // Everyone, but note: submitting an order requires SUBMIT_ORDER
  }

  static canAccessRoute(route: string, user: Customer | null): boolean {
    switch (route) {
      case "dashboard":
        return this.canViewCustomerPortal(user);
      case "design":
        // Legacy flow required a logged in user to even view the design studio to protect pending redirects
        return this.canSubmitOrder(user);
      case "database":
        return this.canViewStaffDashboard(user);
      default:
        return true;
    }
  }

  static canSubmitOrder(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.CUSTOMER,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canViewCustomerPortal(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.CUSTOMER,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManagePersonalProfile(user: Customer | null, targetEmail?: string): boolean {
    const role = this.resolveRole(user);
    if ([this.ROLES.ADMINISTRATOR, this.ROLES.SUPER_ADMINISTRATOR].includes(role)) return true;
    if (role === this.ROLES.CUSTOMER && user?.email === targetEmail) return true;
    return false;
  }

  static canViewStaffDashboard(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.TAILOR,
      this.ROLES.COMMUNITY_COORDINATOR,
      this.ROLES.PRODUCTION_MANAGER,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canUpdateProductionStatus(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.TAILOR,
      this.ROLES.PRODUCTION_MANAGER,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageGallery(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.COMMUNITY_COORDINATOR,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canViewReports(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.PRODUCTION_MANAGER,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageOrders(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageTimeline(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.PRODUCTION_MANAGER,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageBatches(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.PRODUCTION_MANAGER,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageFabrics(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.PRODUCTION_MANAGER,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageShowpieces(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.COMMUNITY_COORDINATOR,
      this.ROLES.PRODUCTION_MANAGER,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageMedia(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.COMMUNITY_COORDINATOR,
      this.ROLES.PRODUCTION_MANAGER,
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageCustomers(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageReferenceData(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canExportReports(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canApprovePayments(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.ADMINISTRATOR,
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageSettings(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }

  static canManageUsers(user: Customer | null): boolean {
    const role = this.resolveRole(user);
    return [
      this.ROLES.SUPER_ADMINISTRATOR
    ].includes(role);
  }
}
