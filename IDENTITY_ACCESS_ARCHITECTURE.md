# IDENTITY & ACCESS ARCHITECTURE BLUEPRINT (PHASE 5.0)

## 1. Executive Summary
This document serves as the official enterprise Identity & Access Architecture for the NTCC platform. It defines the transition from a client-heavy, mock-authentication system into a secure, scalable, role-based access control (RBAC) architecture. This blueprint ensures that identity, authentication, and authorization are decoupled, centralized, and strictly enforced across both the client application and the Firestore database, laying the groundwork for a robust Customer Portal and multi-tiered Staff/Admin dashboards.

## 2. Identity Model
The Identity Model establishes a strict Single Source of Truth for user identities and profiles.
- **Firebase Authentication**: Owns the core **Identity** (UID, credentials, provider tokens, email verification status, phone verification status).
- **Firestore `customers` Collection**: Owns the **Profile & Business Information** (Name, contact details, shipping addresses, linked orders, measurements).
- **Identity Relationship**: A 1:1 authoritative mapping exists between a Firebase Auth UID and a Firestore `customers` Document ID.
  - *Who is a User?* Any entity with a Firebase Auth UID.
  - *Who is a Customer?* A User whose Firestore profile indicates standard consumer privileges.
  - *Who is an Administrator/Staff?* A User whose Firestore profile (or Firebase Custom Claim) grants elevated operational privileges.
  - *Who is a Guest?* An unauthenticated visitor (or a user operating under Firebase Anonymous Authentication) exploring the platform before registration.

## 3. Authentication Model
Authentication is the process of verifying *who* a user is. 
- **Current State**: Mixed native Firebase Auth (Google) and custom client-side mock Auth (Email/Phone + Plaintext PIN).
- **Future Recommended State**: 
  - **Google Sign-In**: Retained as an SSO option for both Customers and Administrators.
  - **Email & Password**: Native Firebase Authentication replaces the plaintext PIN system.
  - **Phone Authentication**: Native Firebase SMS OTP replaces the simulated local OTP.
- **Deprecation Plan**: The local plaintext PIN verification (`passcode` field in Firestore) must be completely deprecated and securely purged from the database.

## 4. Authorization Model
Authorization is the process of verifying *what* a user is allowed to do.
- **Permission Engine**: A centralized business logic module (e.g., `AuthorizationEngine.ts`) will replace scattered React component checks. React will only query this engine (e.g., `AuthorizationEngine.canManageOrders(currentUser)`).
- **Decoupling**: React handles *rendering*. The Permission Engine handles *logic*. Firestore Security Rules handle *database enforcement*.
- **Authorization Flow**:
  1. **User** accesses the application.
  2. **Firebase Authentication** verifies credentials and returns a UID.
  3. **Identity Verification** fetches the associated `customers/{uid}` record.
  4. **Role Resolution** extracts the user's role from the profile.
  5. **Permission Engine** translates the role into specific UI capabilities.
  6. **Application** renders authorized modules.

## 5. Role Matrix
The platform defines the following official roles to support current and future operations:
- **Guest**: Unauthenticated visitor. Can view public galleries, browse fabrics, and assemble designs.
- **Customer**: Authenticated consumer. Can submit orders, view personal order history, and update personal measurements.
- **Community Coordinator**: Staff managing community engagement and basic batch Q&A.
- **Tailor / Production Staff**: Operational staff managing garment lifecycle states (e.g., updating "Quality Control" or "Production Ready").
- **Production Manager**: Oversees tailors, manages batch timelines, and controls capacity limits.
- **Administrator**: General admin with access to most operational and business intelligence modules.
- **Super Administrator**: Absolute control, including user role assignment, system settings, and destructive actions.

## 6. Permission Matrix
Permissions are atomic, boolean capabilities evaluated by the Permission Engine.
- `canSubmitOrders()`: Customer, Administrator, Super Admin
- `canViewPersonalHistory()`: Customer, Administrator, Super Admin
- `canManageTimeline()`: Production Manager, Administrator, Super Admin
- `canManageOrders()`: Administrator, Super Admin
- `canUpdateProductionStatus()`: Tailor, Production Manager, Administrator, Super Admin
- `canManageCustomers()`: Administrator, Super Admin
- `canManageFabrics()`: Production Manager, Administrator, Super Admin
- `canManageGallery()`: Community Coordinator, Administrator, Super Admin
- `canManageReferenceData()`: Administrator, Super Admin
- `canManageUsers()`: Super Admin only
- `canViewReports()`: Production Manager, Administrator, Super Admin
- `canManageSettings()`: Super Admin only

## 7. Session Lifecycle
- **Session Creation**: Occurs immediately upon successful Firebase Authentication.
- **Session Maintenance**: Managed natively by the Firebase Auth SDK (using IndexedDB/LocalStorage under the hood), eliminating manual `localStorage.setItem` for user objects.
- **Session Restoration**: Application utilizes `onAuthStateChanged` to seamlessly restore user context on page refresh.
- **Logout**: Triggers Firebase `signOut()`, clears any cached application state (Zustand), and routes the user to the public home page.
- **Remember-Me**: Handled natively by Firebase Auth persistence settings (default `LOCAL`).

## 8. Account Lifecycle
1. **Registration**: User signs up via Google, Email, or Phone.
2. **Verification**: Email link or SMS OTP confirms identity.
3. **Profile Completion**: User provides Name, Location, and creates their Firestore `customers` document.
4. **First Order**: User submits an order, linking their UID to an `orders` document.
5. **Returning Customer**: User logs in securely, retaining order history and measurement profiles.
6. **Account Suspension (Future)**: Super Admin toggles `isActive: false` in profile; Firestore rules reject queries.
7. **Account Deletion**: User or Admin deletes profile; triggers cleanup of PII while preserving anonymized historical order metrics.

## 9. Security Principles
- **Least-Privilege**: Users and staff receive only the minimum permissions required to perform their tasks.
- **Server-Side Enforcement**: Firestore Security Rules dictate data access based on `request.auth.uid` and user roles, validating every read/write independent of the client application.
- **Client-Side Guards**: Route guards (e.g., `AdminAuthGuard`, `ProtectedRoute`) prevent unauthorized rendering and unnecessary data fetching, providing a smooth UX.
- **Separation of Duties**: No React component determines authorization logic.
- **No Implicit Trust**: Administrator access cannot be granted purely by successfully logging in with a Google Account. The account must be explicitly whitelisted in the database or via Firebase Custom Claims.

## 10. Customer Journey
1. **Guest Browsing**: Explores Featured Outfits, Fabric Showcase, and the Gallery.
2. **Design Intent**: Guest clicks "Design This Outfit", pre-loading styles/fabrics into application state.
3. **Authentication**: App redirects to Login/Registration. Context is preserved in the state manager.
4. **Resumption**: Post-login, the Customer is immediately routed to the Design Studio with their selected fabric, style, and active batch perfectly preserved.
5. **Submission**: Customer submits the order to the secure, authenticated backend.

## 11. Administrator Journey
1. **Admin Login**: Staff member authenticates via Google Workspace or designated email.
2. **Role Verification**: Application queries `customers/{uid}` (or Custom Claims) to verify `role === "Administrator"`.
3. **Permission Resolution**: Permission Engine unlocks specific Dashboard tabs based on exact role (e.g., Tailor vs. Super Admin).
4. **Dashboard Access**: Admin interacts only with authorized modules (e.g., DatabaseView, Business Intelligence).

## 12. Future Expansion Strategy
The architecture is designed to scale horizontally:
- **Multi-Admin Support**: By assigning roles in Firestore, any number of admins can be supported without hardcoding emails.
- **Staff Portals**: A Tailor logging in will see a tailored "Production Dashboard" rather than the full Master Database, governed by the Permission Engine.
- **Customer Portal**: Authenticated customers will have a dedicated space to track individual order statuses, update measurements, and manage delivery addresses.

## 13. Migration Roadmap
The transition to this architecture will occur in sequential, independently deployable phases:

- **Phase 5.1 — Identity Consolidation**: Migrate all existing `customers` documents to align with Firebase Auth UIDs. Implement native Firebase Auth for Email and Phone. Remove plaintext PINs.
- **Phase 5.2 — Permission Engine Implementation**: Build `AuthorizationEngine.ts`. Centralize all role definitions and boolean capability checks.
- **Phase 5.3 — Route & Component Security**: Update `AdminAuthGuard` to utilize the Permission Engine. Implement `ProtectedRoute` for customer-specific views.
- **Phase 5.4 — Firestore Security Hardening**: Deploy robust `firestore.rules` enforcing RBAC at the database layer (e.g., ensuring users can only read their own orders).
- **Phase 5.5 — Customer & Staff Portals (Future)**: Develop tailored UI dashboards mapped directly to the newly established roles.
