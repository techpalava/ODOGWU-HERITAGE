# PERMISSION ENFORCEMENT AUDIT (PHASE 5.0.1B)

## Executive Summary
This document provides a comprehensive map of where authorization and permission checks must be enforced throughout the NTCC application. It acts as the blueprint for integrating the future `AuthorizationEngine` into React components, route guards, and Firestore operations. The audit reveals that current authorization relies heavily on a single client-side `AdminAuthGuard`, which is insufficient for a granular, multi-role enterprise architecture.

## Current Authorization Landscape
- **`AdminAuthGuard.tsx`**: A monolithic client-side wrapper that restricts access to the entire `DatabaseView`. Currently, it only checks if *any* Firebase Auth user exists (via Google Sign-In). It does not verify administrative privileges, creating a significant security vulnerability.
- **Client-Side Assumptions**: The frontend assumes that any user who successfully completes the Google Sign-In popup is authorized to view all customer PII, edit batches, and alter settings.
- **`App.tsx` Route Guards**: Basic conditional rendering prevents unauthenticated users from accessing the `dashboard` and `design` tabs, redirecting them to `login`.
- **Firestore Rules**: Currently set to use mock functions (`isAdmin() { return true; }`), meaning the database does not enforce any backend authorization.

## Permission Map & Enforcement Targets

The following map details exactly where the new `AuthorizationEngine` must be invoked to secure the application.

### 1. View & Route Enforcement (Client-Side Navigation)

| Target Component / Route | Recommended Permission | Future Implementation |
| :--- | :--- | :--- |
| `App.tsx` (Tab: `"dashboard"`) | `VIEW_CUSTOMER_PORTAL` | `AuthorizationEngine.canViewCustomerPortal(currentUser)` |
| `App.tsx` (Tab: `"design"`) | `VIEW_DESIGN_STUDIO` | `AuthorizationEngine.canViewDesignStudio(currentUser)` |
| `App.tsx` (Tab: `"database"`) | `VIEW_STAFF_DASHBOARD` | `AuthorizationEngine.canViewStaffDashboard(currentUser)` |
| `DatabaseView.tsx` (Tab: `"orders"`) | `MANAGE_ORDERS` | `AuthorizationEngine.canManageOrders(currentUser)` |
| `DatabaseView.tsx` (Tab: `"batches"`) | `MANAGE_BATCHES` | `AuthorizationEngine.canManageBatches(currentUser)` |
| `DatabaseView.tsx` (Tab: `"fabrics"`) | `MANAGE_FABRICS` | `AuthorizationEngine.canManageFabrics(currentUser)` |
| `DatabaseView.tsx` (Tab: `"customers"`) | `MANAGE_CUSTOMERS` | `AuthorizationEngine.canManageCustomers(currentUser)` |
| `DatabaseView.tsx` (Tab: `"showpieces"`) | `MANAGE_SHOWPIECES` | `AuthorizationEngine.canManageShowpieces(currentUser)` |
| `DatabaseView.tsx` (Tab: `"photos"`) | `MANAGE_GALLERY` | `AuthorizationEngine.canManageGallery(currentUser)` |
| `DatabaseView.tsx` (Tab: `"styles"`) | `MANAGE_REFERENCE_DATA` | `AuthorizationEngine.canManageReferenceData(currentUser)` |
| `DatabaseView.tsx` (Tab: `"settings"`, `"plugins"`) | `MANAGE_SETTINGS` | `AuthorizationEngine.canManageSettings(currentUser)` |
| `DatabaseView.tsx` (Tab: `"roles"`, `"audit"`) | `MANAGE_USERS` | `AuthorizationEngine.canManageUsers(currentUser)` |
| `DatabaseView.tsx` (Tab: `"operations"`) | `VIEW_REPORTS` | `AuthorizationEngine.canViewReports(currentUser)` |

### 2. Component & Action Enforcement (UI Elements)

| Target Component / Action | Recommended Permission | Future Implementation |
| :--- | :--- | :--- |
| `DashboardView.tsx` (Profile/Measurements Edit) | `MANAGE_PERSONAL_PROFILE` | `AuthorizationEngine.canManagePersonalProfile(currentUser, targetUserId)` |
| `DesignStudioView.tsx` (Checkout/Payment) | `SUBMIT_ORDER` | `AuthorizationEngine.canSubmitOrder(currentUser)` |
| `BatchManagementPanel.tsx` (Edit, Open, Close) | `MANAGE_BATCHES` | `AuthorizationEngine.canManageBatches(currentUser)` |
| `DatabaseView.tsx` (Delete Customer Button) | `MANAGE_CUSTOMERS` | `AuthorizationEngine.canManageCustomers(currentUser)` |
| `DatabaseView.tsx` (Update Order Status) | `UPDATE_PRODUCTION_STATUS`| `AuthorizationEngine.canUpdateProductionStatus(currentUser)` |
| `DatabaseView.tsx` (Export CSV Buttons) | `EXPORT_REPORTS` | `AuthorizationEngine.canExportReports(currentUser)` |

### 3. Backend & Firestore Enforcement (Security Rules)

*Crucial Note: Client-side guards only hide UI elements. True security requires matching enforcement at the database layer.*

| Firestore Collection / Path | Operation | Required Condition (Future `firestore.rules`) |
| :--- | :--- | :--- |
| `/customers/{userId}` | `read`, `write` | `request.auth.uid == userId || request.auth.token.role == 'Administrator'` |
| `/orders/{orderId}` | `read` | `resource.data.customerId == request.auth.uid || request.auth.token.role in ['Administrator', 'Production Manager', 'Tailor']` |
| `/orders/{orderId}` | `create` | `request.auth.uid != null` |
| `/batches/{batchId}` | `write` | `request.auth.token.role in ['Administrator', 'Production Manager']` |
| `/fabrics/{fabricId}` | `write` | `request.auth.token.role in ['Administrator', 'Production Manager']` |
| `/businessSettings/{doc}` | `write` | `request.auth.token.role == 'Super Administrator'` |
| `/roles/{roleId}` | `read`, `write` | `request.auth.token.role == 'Super Administrator'` |

## Security Assessment & Vulnerabilities
1. **Privilege Escalation Risk**: Currently, any user who can execute `signInWithPopup` via Google is granted unrestricted access to `DatabaseView.tsx` because `AdminAuthGuard` does not evaluate roles or custom claims.
2. **Missing Granularity**: `DatabaseView.tsx` does not segment its tabs. If an admin is granted access, they receive absolute access to settings, user roles, financial data, and PII. A `Community Coordinator` needing access to `MANAGE_GALLERY` would dangerously inherit `MANAGE_SETTINGS`.
3. **Client-Side Spoofing**: Because permissions are currently absent, a malicious user could manually bypass `AdminAuthGuard` rendering checks if they manipulate the React DOM or application state.

## Implementation Roadmap

To transition to the secure architecture, the following steps must be executed:

1. **Develop `AuthorizationEngine.ts`**: Create the centralized class that accepts a `Customer` object and evaluates the standard permissions defined above.
2. **Refactor `AdminAuthGuard.tsx`**: Update the guard to accept a `requiredPermission` prop (e.g., `<AdminAuthGuard requiredPermission="VIEW_STAFF_DASHBOARD">`).
3. **Granular Component Protection**: Wrap individual tabs inside `DatabaseView.tsx` with permission checks (e.g., `if (AuthorizationEngine.canManageBatches(currentUser)) { render BatchManagementPanel }`).
4. **Deploy Custom Claims**: Implement a secure mechanism (via Firebase Cloud Functions or manual initialization script) to set Firebase Auth Custom Claims (e.g., `{ role: "Administrator" }`).
5. **Secure Firestore Rules**: Update `firestore.rules` to strictly enforce the permission mapping against `request.auth.token`.

### 4. Protected Services & Engines
| Target Service / Engine | Recommended Permission | Future Implementation |
| :--- | :--- | :--- |
| `CapacityService.ts` (Commit Order) | `SUBMIT_ORDER` | Implicit via Firestore rules enforcing `orders` creation |
| `BatchBusinessRules.ts` | N/A | Evaluates business logic, not user permissions. Called downstream. |
| `OrderRoutingEngine.ts` | N/A | System-level routing. |
| `api.ts` (fetchSession, saveSession) | N/A | Available to all users for identity operations. |
| `storageService.ts` (saveCollection) | Variable | Must rely on Firestore Security rules for rejection based on role. |

## Recommended PermissionEngine API
The future `AuthorizationEngine` should expose static methods adhering strictly to the `can[Action]()` naming convention:
```typescript
export class AuthorizationEngine {
  static canViewCustomerPortal(user: Customer | null): boolean;
  static canViewStaffDashboard(user: Customer | null): boolean;
  static canManageOrders(user: Customer | null): boolean;
  static canManageBatches(user: Customer | null): boolean;
  static canManageFabrics(user: Customer | null): boolean;
  static canManageShowpieces(user: Customer | null): boolean;
  static canManageGallery(user: Customer | null): boolean;
  static canManageMedia(user: Customer | null): boolean;
  static canManageCustomers(user: Customer | null): boolean;
  static canManageReferenceData(user: Customer | null): boolean;
  static canManageSettings(user: Customer | null): boolean;
  static canViewReports(user: Customer | null): boolean;
  static canManageUsers(user: Customer | null): boolean;
}
```
