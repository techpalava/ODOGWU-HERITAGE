# Enterprise Architecture Compliance Audit Report
## NTCC / Odogwu Heritage Platform

## Executive Summary
This document provides a comprehensive Enterprise Architecture Compliance Audit for the NTCC / Odogwu Heritage platform. It assesses the current implementation against the official `DATA_DICTIONARY.md` (the Master Technical Blueprint) to identify discrepancies, unnormalized data, and potential performance/security risks.

---

## 1. Collection Compliance

| Collection | Exists | Purpose Matches | Fields Match | Types Match | Compliance |
|:---|:---:|:---:|:---:|:---:|:---|
| `batches` | Yes | Yes | Mostly | Yes | **WARNING** - Missing new production stat fields in actual DB writes in some places. |
| `fabrics` | Yes | Yes | Yes | Yes | **PASS** |
| `styles` | Yes | Yes | Mostly | Yes | **WARNING** - Some hardcoded style types exist in UI components. |
| `customers` | Yes | Yes | Yes | Yes | **PASS** |
| `orders` | Yes | Yes | Mostly | Yes | **WARNING** - Duplicates `batchName` and other fields that could be queried via reference. |
| `showpieces` | Yes | Yes | Yes | Yes | **PASS** |
| `communityPhotos` | Yes | Yes | Yes | Yes | **PASS** |
| `fabric_drafts` | Yes | Yes | Yes | Yes | **PASS** |
| `settings` | Yes | Yes | Yes | Yes | **PASS** |
| `media` | Yes | Yes | Yes | Yes | **PASS** |

---

## 2. Relationship Compliance

**Customers -> Orders -> Batches / Fabrics / Styles / Showpieces**
- **Foreign Keys:** Implemented via `customerId`, `batchId`, `fabricId`, and `styleId`.
- **Integrity:** Maintained primarily at the application level.
- **Missing References:** None detected in schema.
- **Incorrect Joins:** No SQL-style joins, but application-level document fetching works as expected.

**Compliance:** **PASS**

---

## 3. Snapshot vs Reference Audit

### Correct Historical Snapshots
- **Order Design Snapshot:** `orders.design` copies the Style and Fabric base prices. This is **Correct** to prevent historical price inflation on past orders.

### Unnecessary Duplication (⚠ WARNING)
- **`batchName` in Orders:** Duplicated in `orders`. Should be joined at the UI level via `batchId`.
- **`participantName` in `communityPhotos`:** Duplicated. Should be referenced via `customerId`.

**Recommendation:** Normalize duplicated strings to reduce update anomalies (e.g. if a Batch Name changes).

---

## 4. Hardcoded Data Audit

**Identified Hardcoded Data in Components (`src/components/DatabaseView.tsx`, `src/data/pricingData.ts`):**
- **Batch Statuses:** `Draft`, `Open`, `Closed`, `Completed`, etc. *(Resolved in Phase 2A)*
- **Fabric Categories:** `Handcrafted Fabrics`, `Traditional Fabrics`, `Luxury Fabrics` *(Resolved in Phase 2A)*
- **Garment Categories:** `Senator Set`, `Agbada`, `Isiagu Set`, `Maxi Gown`, etc. *(Resolved in Phase 2A)*
- **Pricing & Discounts:** `OFFICIAL_PRICE_LIST` in `pricingData.ts`.

**Recommendation:** Move pricing matrices into the `settings` collection or a new `reference_data` collection (Phase 2B). Dropdowns, statuses, and classifications were successfully centralized into `reference_data` in Phase 2A.

---

## 5. Master Data Compliance

- **Batches:** Treated as authoritative.
- **Fabrics:** Treated as authoritative.
- **Styles:** Treated as authoritative.
- **Settings:** Handled globally.

**Compliance:** **WARNING** - The hardcoded `OFFICIAL_PRICE_LIST` bypasses the `settings` or `styles` master collections for some base calculations.

---

## 6. Page Compliance

- **Design Studio:** Reads Active Batch, Styles, Fabrics. Writes Orders. (Matches Dictionary)
- **Database Hub:** Full CRUD. (Matches Dictionary)
- **Homepage:** Reads Settings, Active Batch, Community Photos. (Matches Dictionary)

**Compliance:** **PASS**

---

## 7. State Management

- **Zustand (`useAppStore.ts`):** Centralized state management.
- **Realtime Listeners:** `StorageService` sets up `onSnapshot` listeners for all collections on initialization.
- **Risk (Memory/Performance):** Loading *all* collections (especially `orders` and `communityPhotos`) into memory at app boot will cause significant memory pressure and excessive Firestore reads as the dataset grows.

**Compliance:** **WARNING**

---

## 8. Firebase Storage

- **Folders:** `fabrics/`, `styles/`, `designs/`, `logos/`, `gallery/`, `hero/`
- **Upload Workflow:** Centralized via `MediaRepository`.
- **Naming Conventions:** `[folder]/[sanitizedName]_[timestamp].[ext]`

**Compliance:** **PASS**

---

## 9. Security Compliance

- **Authentication:** Firebase Auth implemented.
- **Authorization:** Handled primarily via UI component mounting and `AdminAuthGuard`.
- **Risk:** Weak server-side Firestore Security Rules (often public or authenticated-only without strict RBAC checks).

**Compliance:** **FAIL** - Must implement rigorous Firestore Security Rules checking custom claims or user roles before production.

---

## 10. Performance Compliance

- **Firestore Reads:** `onSnapshot` on large collections (like `orders`) will trigger excessive reads.
- **Pagination:** Missing on list views and in `StorageService`.
- **Lazy Loading:** Missing for historical batches and older orders.

**Compliance:** **WARNING** - Must implement pagination/limits on `StorageService` queries.

---

## 11. Business Rule Compliance

- **Batch Timeline:** Maintained.
- **Active Batch:** Enforced (only one batch is active).
- **Fabric/Media Workflow:** Implemented correctly via `MediaRepository`.

**Compliance:** **PASS**

---

## 12. Dead Code Audit

- No significant dead code found, but `pricingData.ts` should be deprecated in favor of Firebase-driven pricing.

---

## 13. Data Quality Audit

- **Inconsistent Naming:** None critical.
- **Duplicate Fields:** `batchName` in `orders`.
- **Missing Indexes:** Compound queries (e.g., querying orders by `customerId` AND `batchId`) may require composite indexes in Firestore.

---

## 14. Compliance Score

| Category | Score |
|:---|:---:|
| Architecture Compliance | 85% |
| Database Design | 90% |
| Relationship Integrity | 95% |
| Maintainability | 80% |
| Scalability | 60% |
| Performance | 65% |
| Security | 40% |
| Documentation Accuracy | 95% |
| **Overall Production Readiness** | **70%** |

---

## 15. Prioritized Action Plan

### 🔴 Critical (Must fix before launch)
1. **Firestore Security Rules:** Implement RBAC at the database layer. Client-side hiding is insufficient.
2. **State Management Scalability:** Remove full-collection `onSnapshot` listeners for unbounded collections (`orders`, `communityPhotos`) and implement paginated queries.

### 🟠 High Priority
1. **Deprecate Hardcoded Pricing:** Move `pricingData.ts` fully into the `settings` collection.

### 🟡 Medium Priority
1. **Reference Data Normalization:** Create a `reference_data` collection for dropdowns (statuses, categories). *(Resolved in Phase 2A)*
2. **Cloud Functions for Aggregation:** Move "New Participants", "Dresses Made", etc., calculations to Cloud Functions instead of client-side loops.

### 🟢 Low Priority
1. **Normalize Duplicated Strings:** Remove `batchName` from orders and rely on the `batchId` reference.

---

## Enterprise Readiness Assessment

The current NTCC / Odogwu Heritage platform **is structurally sound and closely aligns with the Data Dictionary.** The data models, relationships, and component boundaries are well-designed for a modern React/Zustand architecture. 

However, **it is NOT YET ready for enterprise-scale production deployment.** The platform relies too heavily on client-side security and full-collection memory loading (`onSnapshot`). Before going live to thousands of users, the engineering team MUST implement strict Firestore Security Rules and paginated data fetching.
