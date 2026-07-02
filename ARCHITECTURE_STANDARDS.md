# NTCC / Odogwu Heritage - Official Architecture Standards Manual

## Table of Contents
1. [Section 1 — Project Philosophy](#section-1--project-philosophy)
2. [Section 2 — Single Source of Truth](#section-2--single-source-of-truth)
3. [Section 3 — Master Data Rules](#section-3--master-data-rules)
4. [Section 4 — Reference Data Rules](#section-4--reference-data-rules)
5. [Section 5 — Database Design Standards](#section-5--database-design-standards)
6. [Section 6 — Business Rule Standards](#section-6--business-rule-standards)
7. [Section 7 — State Management Standards](#section-7--state-management-standards)
8. [Section 8 — Firebase Standards](#section-8--firebase-standards)
9. [Section 9 — Media Standards](#section-9--media-standards)
10. [Section 10 — Component Standards](#section-10--component-standards)
11. [Section 11 — UI/UX Standards](#section-11--uiux-standards)
12. [Section 12 — Performance Standards](#section-12--performance-standards)
13. [Section 13 — Security Standards](#section-13--security-standards)
14. [Section 14 — Feature Development Standard](#section-14--feature-development-standard)
15. [Section 15 — Development Checklist](#section-15--development-checklist)
16. [Section 16 — Code Review Standards](#section-16--code-review-standards)
17. [Section 17 — AI Development Rules](#section-17--ai-development-rules)
18. [Section 18 — Future Architecture Roadmap](#section-18--future-architecture-roadmap)

---

## Section 1 — Project Philosophy

The NTCC / Odogwu Heritage platform follows these core guiding principles:

- **Data-First Architecture**: Features are built around robust data models, not UI screens. The data dictates the application flow.
- **Business Modules over Individual Pages**: Logic should be grouped by business domain (e.g., Batches, Orders, Fabrics) rather than isolated view components.
- **Single Source of Truth**: Data must exist in only one authoritative place. Duplication is strictly forbidden unless for intentional point-in-time snapshots.
- **Configuration over Hardcoding**: Business variables (pricing, categories, statuses) must reside in database settings or reference data, never hardcoded in UI components.
- **Scalability by Design**: Code must be written anticipating high volume. Data fetching must use pagination; memory footprint must remain minimal.
- **Security by Default**: Client-side visibility constraints are not security. True security is enforced via Firebase Security Rules and backend authorization checks.
- **Maintainability Before Convenience**: "Quick fixes" that bypass the architecture are prohibited. All code must be readable, documented, and aligned with standard patterns.
- **Enterprise-Ready Development**: The platform is built to support a global community. All code must reflect enterprise-grade reliability, error handling, and separation of concerns.

---

## Section 2 — Single Source of Truth

To prevent synchronization issues and bugs, every major business domain has one strict authoritative owner.

- **Timeline Manager** → Controls all production batches and lifecycle events.
- **Settings** → Controls global business configuration, including pricing rules and application toggles.
- **Media Repository** → Controls all uploaded assets, managing paths, URLs, and metadata.
- **Firestore** → Owns all business data persistence.
- **Zustand Store** → Owns the synchronized frontend application state.
- **React Components** → strictly for **presenting data** and capturing user input. They do not own or derive complex business logic.

Business logic should never be duplicated across multiple components.

---

## Section 3 — Master Data Rules

Master collections form the core operational pillars of the platform.

### Master Collections:
1. **Batches**: Owns the production lifecycle.
2. **Customers**: Owns user identity and profiles.
3. **Orders**: Owns the transactional record of purchases.
4. **Fabrics**: Owns raw material inventory and definitions.
5. **Styles**: Owns structural garment definitions and base pricing.
6. **Showpieces**: Owns the visual catalog for the Lookbook.
7. **Settings**: Owns global app parameters.

### Rules for Master Data:
- **Purpose**: To act as the root node for relational lookups.
- **Ownership**: Only authorized admin modules may mutate Master Data (except for Customers mutating their own profiles, or placing Orders).
- **Relationships**: Other collections reference Master Data via their document IDs (Foreign Keys).
- **Forbidden Responsibilities**: Master Data must not contain transient session states, UI-specific flags, or deeply nested arrays of unbounded data.

---

## Section 4 — Reference Data Rules

Reference Data comprises reusable, standardized values used across the platform.

### Examples:
- Statuses (Order Status, Batch Status)
- Categories (Fabric Categories, Garment Types)
- Roles (Admin, User)
- Payment Methods, Shipping Methods, Visibility toggles.

### Rules:
- **Never hardcode** reference data inside UI components (e.g., hardcoded `<option>` lists or `switch` statements).
- Reference data must eventually come from a centralized configuration (e.g., a `reference_data` Firestore collection or a robust `settings` document).
- When resolving labels from reference keys, use a centralized utility or service, not inline component logic.

---

## Section 5 — Database Design Standards

All Firestore interactions and schema designs must follow these standards:

- **Stable IDs**: Every document requires a stable, uniquely generated ID (e.g., UUIDv4 or Firestore auto-ID).
- **References over Duplication**: Use Foreign Keys (e.g., `batchId`, `customerId`) instead of duplicating business data across collections.
- **Intentional Snapshots**: Use data snapshots ONLY when historical accuracy is required (e.g., saving the *price* of a fabric at the exact time an order was placed so future price changes do not alter old receipts).
- **Avoid Unnecessary Nesting**: Keep document structures flat. Do not nest large arrays of objects within a document, as Firestore limits document size to 1MB and updates rewrite the entire document.
- **Avoid Duplicate Collections**: Do not create temporary or duplicate collections for views. Rely on queries and indexes.
- **Naming Conventions**:
  - Collections: `camelCase` and plural (e.g., `customGroups`, `orders`).
  - Fields: `camelCase` (e.g., `orderDate`, `totalAmount`).

---

## Section 6 — Business Rule Standards

Business rules must be clearly separated from presentation logic.

- **Timeline owns batches**: Only the batch management service can open, close, or progress a batch.
- **Design Studio consumes the active batch**: The studio must only allow orders against the currently active batch.
- **Orders reference batches**: Every order must be strictly tied to a batch.
- **Gallery references approved showpieces/photos**: The community gallery displays only approved community photos.
- **Settings own pricing**: Price calculations must use the global settings configuration, not hardcoded numeric multipliers in components.
- **Components Must Never Invent Business Rules**: UI components trigger actions (e.g., `submitOrder()`), but the calculation, validation, and persistence of that action live in the Service layer.

---

## Section 7 — State Management Standards

The platform uses Zustand for global state management.

- **One Centralized Store**: Use `useAppStore.ts` as the primary state container.
- **No Duplicated State**: If data exists in the global store, do not duplicate it into local component state (`useState`) unless editing a draft before submission.
- **Avoid Direct Firestore Reads in UI**: Components must select state from Zustand. Zustand/Services handle Firestore interactions.
- **Prevent Duplicate Listeners**: Ensure `onSnapshot` listeners are initialized once (e.g., on app mount) and properly cleaned up to prevent memory leaks.
- **On-Demand Loading**: Transition away from loading entire collections into memory. Large collections (Orders, Gallery) must use paginated fetches rather than full-collection listeners.

---

## Section 8 — Firebase Standards

- **Firestore**: Optimize for reads. Use composite indexes for complex queries. Use `runTransaction` or `writeBatch` for multi-document updates.
- **Firebase Storage**: Files must be organized logically. Never upload base64 strings directly to Firestore documents.
- **Authentication**: Rely on Firebase Auth state. The `currentUser` object in Zustand should directly reflect the Auth state.
- **Security Rules**: All environments must have strict `.rules` deployed. Never use "test mode" rules in production.
- **Caching**: Utilize Firestore offline persistence where applicable, but be cautious of cache staleness in multi-admin environments.

---

## Section 9 — Media Standards

All media uploads must route through the `MediaRepository`.

- **Image Uploads**: Must be compressed and resized locally before upload to save bandwidth and storage costs.
- **Storage Folders**: Strictly partitioned (`fabrics/`, `styles/`, `designs/`, `logos/`, `gallery/`, `hero/`).
- **Naming**: Format as `[category]/[entityId]/[sanitizedFileName]_[timestamp].[ext]`.
- **Metadata**: Every uploaded file must have a corresponding document in the `media` Firestore collection for tracking and orphan cleanup.
- **Media Lifecycle**: When deleting an entity, gracefully handle or clean up the associated media files.

---

## Section 10 — Component Standards

React components must remain clean, predictable, and performant.

- **Single Responsibility**: A component should do one thing well.
- **Reusable**: Build generic UI components (buttons, inputs, cards) independent of business logic.
- **Avoid Business Logic**: Keep complex data transformations in utility functions or services.
- **Data via Props/Store**: Receive data via props or `useAppStore` selectors.
- **No Direct DB Manipulation**: Components dispatch actions; they do not call `setDoc` or `deleteDoc` directly.

---

## Section 11 — UI/UX Standards

Maintain the high-end, bespoke aesthetic of the Odogwu Heritage brand.

- **Spacing & Typography**: Follow the Tailwind utility classes defined in the global design system. Use consistent padding/margins.
- **Responsiveness**: All interfaces must be fully responsive (Mobile, Tablet, Desktop) using Tailwind's breakpoint prefixes.
- **Loading States**: Provide immediate visual feedback. Use Skeleton loaders for data fetching, not just spinning circles.
- **Animations**: Use Framer Motion (`motion/react`) for smooth, purposeful transitions. Avoid gratuitous or distracting animations.
- **Accessibility**: Ensure high contrast, proper ARIA labels, and keyboard navigability (especially for modals and drawers).
- **Heritage Branding**: Strict adherence to the color palette (Heritage Green, Heritage Gold, Heritage Beige, etc.).

---

## Section 12 — Performance Standards

- **Lazy Loading**: Use React `lazy()` and `Suspense` for heavy, non-critical routes.
- **Pagination / Virtualization**: Lists rendering more than 50 items must use pagination, infinite scrolling, or virtualization to prevent DOM bloat.
- **Avoid Loading Entire Collections**: Never fetch `orders` or `customers` without limits in production.
- **Minimize Firestore Costs**: Cache frequently accessed, rarely changing data (like Settings or Styles) locally if necessary. Prevent duplicate queries during component re-renders.
- **Image Optimization**: Always serve WebP formats where possible. Use appropriate sizes (don't load a 4K image for a 50px avatar).

---

## Section 13 — Security Standards

- **Authentication**: Required for all custom orders and profile access.
- **Authorization (RBAC)**: Admins must be verified securely. Client-side hiding of Admin menus is insufficient; the backend (Firestore Rules) must reject unauthorized writes.
- **Protected Routes**: Wrap sensitive routes in guard components (e.g., `AdminAuthGuard`).
- **Sensitive Operations**: Batch deletions, setting changes, and pricing updates require Admin-level clearance.

---

## Section 14 — Feature Development Standard

Every new feature MUST follow this mandatory workflow:

1. **Business Requirement**: Understand the goal.
2. **Architecture Review**: Determine how it fits into the existing system.
3. **Data Dictionary Review**: Consult `DATA_DICTIONARY.md`.
4. **Compliance Check**: Consult `COMPLIANCE_AUDIT.md`.
5. **Migration Impact Review**: Consult `MIGRATION_STRATEGY.md`.
6. **Implementation**: Write the code according to these standards.
7. **Testing**: Verify functionality and performance.
8. **Documentation Update**: Update `DATA_DICTIONARY.md` if schema changes occurred.
9. **Deployment**: Release the feature.

*Bypassing this process leads to technical debt and is strictly prohibited.*

---

## Section 15 — Development Checklist

Before submitting a PR or finalizing a feature, verify:

- [ ] Complies with `DATA_DICTIONARY.md`.
- [ ] Complies with `ARCHITECTURE_STANDARDS.md`.
- [ ] Migration impact reviewed and handled.
- [ ] No duplicate business logic introduced.
- [ ] No hardcoded business data (options, prices, statuses).
- [ ] Uses existing Master Data collections appropriately.
- [ ] Uses Reference Data appropriately.
- [ ] Follows security standards (Rules updated if needed).
- [ ] Follows performance standards (Pagination, lazy loading).
- [ ] Documentation updated to reflect changes.

---

## Section 16 — Code Review Standards

Code reviews must scrutinize the following areas:

- **Architecture**: Does this belong in a Service, Store, or Component?
- **Performance**: Will this scale to 10,000 records? Are there N+1 query problems?
- **Security**: Can a malicious user bypass this logic?
- **Maintainability**: Is the code clean, modular, and DRY?
- **Naming**: Are variables, functions, and files named clearly and consistently?
- **Documentation**: Are complex algorithms commented?

---

## Section 17 — AI Development Rules

When AI assistants (Agents) are generating or modifying code for this project, they MUST adhere to the following rules:

1. **Prerequisite Reading**: Before writing code, the AI must review:
   - `DATA_DICTIONARY.md`
   - `COMPLIANCE_AUDIT.md`
   - `MIGRATION_STRATEGY.md`
   - `ARCHITECTURE_STANDARDS.md`
2. **No Duplicate Logic**: The AI must search for existing helper functions and services before writing new ones.
3. **No Unnecessary Collections**: The AI must not invent new Firestore collections unless explicitly instructed and documented.
4. **Extend, Don't Rewrite**: Prefer extending existing architecture gracefully.
5. **Architectural Transparency**: If the user requests a feature that violates these standards, the AI must explain the architectural conflict before implementing the changes.

---

## Section 18 — Future Architecture Roadmap

The platform's architecture will evolve through these prioritized phases:

### Immediate Priority
- **Firestore Security Rules**: Implement robust Role-Based Access Control (.rules).
- **Pagination Rollout**: Refactor `StorageService` to use query limits instead of full-collection listeners for historical data.

### Near-Term Priority
- **Reference Data Module**: Extract all hardcoded UI dropdowns, pricing, and statuses into a centralized `reference_data` Firestore collection.
- **Cloud Functions**: Migrate production statistics calculation (dresses made, participant counts) to backend Firebase Cloud Functions to ensure transactional integrity.

### Long-Term Priority
- **Inventory Module**: Formalize fabric yardage tracking and real-time stock deduction upon order confirmation.
- **Reporting & Analytics Engine**: Build a dedicated admin dashboard for financial and production metrics using aggregated data.
- **Notifications**: Implement automated email/WhatsApp notifications on order status changes.

### Enterprise Scale
- **Algolia / Typesense Integration**: For robust, typo-tolerant search across Fabrics, Orders, and Customers.
- **Plugin System**: Architect a modular plugin system for third-party integrations (e.g., shipping providers, payment gateways).
