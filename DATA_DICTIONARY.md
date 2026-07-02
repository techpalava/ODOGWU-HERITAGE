# NTCC / Odogwu Heritage - Master Technical Blueprint & Data Dictionary

## Table of Contents
1. [Section 1 — System Overview](#section-1--system-overview)
2. [Section 2 — Firestore Collections](#section-2--firestore-collections)
3. [Section 3 — Relationship Map](#section-3--relationship-map)
4. [Section 4 — Master Data](#section-4--master-data)
5. [Section 5 — Reference Data](#section-5--reference-data)
6. [Section 6 — Snapshot vs Reference Fields](#section-6--snapshot-vs-reference-fields)
7. [Section 7 — Firebase Storage](#section-7--firebase-storage)
8. [Section 8 — State Management](#section-8--state-management)
9. [Section 9 — Page Data Dependencies](#section-9--page-data-dependencies)
10. [Section 10 — Business Workflows](#section-10--business-workflows)
11. [Section 11 — Data Flow Diagrams](#section-11--data-flow-diagrams)
12. [Section 12 — Admin Features](#section-12--admin-features)
13. [Section 13 — Current Architecture Assessment](#section-13--current-architecture-assessment)
14. [Section 14 — Future Improvements](#section-14--future-improvements)
15. [Section 15 — Glossary](#section-15--glossary)

---

## Section 1 — System Overview

**Project Purpose**
The NTCC (Nigerian Traditional Clothing Community) / Odogwu Heritage platform is a data-driven enterprise e-commerce and community platform that allows participants to order custom-tailored Nigerian traditional garments in organized production batches.

**Overall Architecture**
- **Frontend Framework:** React 18+ (Vite)
- **Language:** TypeScript
- **State Management:** Zustand
- **Backend / Database:** Firebase (Firestore)
- **File Storage:** Firebase Storage
- **Authentication:** Firebase Auth (Google Provider)
- **Styling:** Tailwind CSS

**Main Business Workflow**
Administrators create production **Batches**. **Fabrics** and **Styles** are uploaded and maintained in the Database Hub. Participants use the **Design Studio** to select a Style, pick a Fabric, provide Measurements, and submit a Custom Order. Orders are grouped by Batch and managed through the production lifecycle. Finished garments are showcased in the **Community Gallery**.

---

## Section 2 — Firestore Collections

### 1. `batches`
- **Purpose:** Manages the lifecycle of production batches, organizing orders into manageable timeframes.
- **Primary Key:** `id` (String)
- **Referenced By:** `orders`, `customGroups`
- **Document Structure:**
  - `id`: string (Required)
  - `batchNumber`: number (Required)
  - `name`: string (Required)
  - `startDate`, `endDate`: string (Required)
  - `targetGarments`, `currentGarments`, `currentOrders`, `currentCustomers`: number (Required)
  - `status`: string (Required) - e.g., "Open", "Closed", "Production Ready"
  - `isActive`: boolean (Optional)
  - `visibility`: "Private" | "Public" (Required)
  - `newParticipants`, `previousParticipants`, `dressesMade`: number (Optional, production stats)
- **Business Rules:** Only one batch can be active at a time (unless manually overridden). Status can be dynamically calculated based on dates.

### 2. `fabrics`
- **Purpose:** Stores the catalog of available fabrics for custom orders.
- **Primary Key:** `id` or `code` (String)
- **Referenced By:** `orders`, `showpieces`
- **Document Structure:**
  - `id`: string (Required)
  - `code`: string (Required)
  - `name`: string (Required)
  - `type`: string (Required)
  - `colors`: string[] (Required)
  - `imageUrl`: string (Required)
  - `stockYards`: number (Required)
  - `pricePerYard`: number (Required)

### 3. `styles` (StyleCategory)
- **Purpose:** Defines the structural categories of garments (e.g., Senator, Agbada, Kaftan).
- **Primary Key:** `id` (String)
- **Referenced By:** `orders`, `showpieces`
- **Document Structure:**
  - `id`: string (Required)
  - `name`: string (Required)
  - `basePrice`: number (Required)
  - `description`: string (Required)
  - `gender`: "male" | "female" | "unisex" (Required)
  - `allowedFabrics`: string[] (Required)

### 4. `customers`
- **Purpose:** Maintains the user profiles, including contact info and stored measurements.
- **Primary Key:** `email` (String)
- **Referenced By:** `orders`
- **Document Structure:**
  - `id`: string (Required)
  - `name`: string (Required)
  - `email`: string (Required)
  - `phone`: string (Required)
  - `measurements`: Object (Optional)
  - `joinedBatches`: string[] (Optional)
  - `role`: string (Optional, e.g., "admin")

### 5. `orders` (MasterOrder)
- **Purpose:** The transactional record of a customer's purchase.
- **Primary Key:** `id` (String)
- **References:** `customers`, `batches`, `fabrics`, `styles`
- **Document Structure:**
  - `id`: string (Required)
  - `orderNumber`: string (Required)
  - `customerId`: string (Required)
  - `batchId`: string (Required)
  - `status`: string (Required)
  - `design`: Object (Style, Fabric, Measurements snapshot)
  - `payment`: Object (Amount, Date, Status)

### 6. `showpieces`
- **Purpose:** Represents curated examples of finished garments for the Lookbook/Homepage.
- **Primary Key:** `id` (String)
- **Document Structure:**
  - `id`: string (Required)
  - `title`: string (Required)
  - `styleId`: string (Required)
  - `fabricCode`: string (Required)
  - `imageUrl`: string (Required)

### 7. `communityPhotos`
- **Purpose:** Manages the Community Gallery of participants wearing their outfits.
- **Primary Key:** `id` (String)
- **Document Structure:**
  - `id`: string (Required)
  - `participantName`: string (Required)
  - `batchNumber`: number (Required)
  - `imageUrl`: string (Required)

### 8. `fabric_drafts`
- **Purpose:** Temporary holding collection for AI-assisted fabric uploads.
- **Referenced By:** Admin UI (DatabaseView listens to this collection).

### 9. `settings` (BusinessSettings)
- **Purpose:** Global application configuration (pricing, logistics, themes).
- **Primary Key:** `business` (Singleton Document)

### 10. `media` (MediaMetadata)
- **Purpose:** Tracks all files uploaded to Firebase Storage.
- **Primary Key:** `id` (String)
- **Document Structure:**
  - `id`, `url`, `storagePath`, `imageCategory`, `relatedEntityId`

---

## Section 3 — Relationship Map

```text
Customers (1) ----< (M) Orders >---- (1) Batches
                                 >---- (1) Fabrics
                                 >---- (1) Styles

Styles (1) ----< (M) Showpieces >---- (1) Fabrics

Batches (1) ----< (M) CommunityPhotos
```

- **One-to-Many:** Customer to Orders. Batch to Orders.
- **Many-to-One:** Orders to Customer, Batch, Fabric, Style.

---

## Section 4 — Master Data

1. **Batches**: Drives the entire timeline and availability of the Design Studio.
2. **Fabrics**: Drives the material selection. Required for orders.
3. **Styles**: Drives the pricing baseline and garment structure.
4. **Customers**: Core CRM data, powers authentication and historical reference.
5. **Settings**: Singleton configuration powering financial calculations.

---

## Section 5 — Reference Data

- **Batch Statuses**: Draft, Yet To Start, Open, Recruiting, Almost Full, Full, Closed, Coming Soon, Production Ready, Production Started, Quality Control, Packed, Shipped, Arrived Netherlands, Ready For Pickup, Collected, Completed.
- **Fabric Categories**: Printed Fabrics, Handcrafted Fabrics, Traditional Fabrics, Luxury Fabrics.
- **Fabric Stock Status**: In Stock, Low Stock, Out of Stock, Hidden.
- **Visibility**: Public, Private.
- **Genders**: male, female, unisex, couple, family.
- **Gallery Categories**: male, female, fabric.
- **Outfit Types**: Senator Set, Kaftan, Agbada, Boubou, etc.
- **Garment Compositions**: 2-Piece Set, 3-Piece Set, Shirt Only, etc.
- **Countries**: Netherlands, Belgium, Germany, Nigeria.
- **Delivery Months**: July 2026, August 2026, etc.

*Architecture Note:* Statuses and Reference tags are stored in a dedicated `reference_data` collection and loaded into the global state upon application initialization, allowing dynamic addition without code changes.

---

## Section 6 — Snapshot vs Reference Fields

**Snapshot Fields (Intentional Duplication):**
- **Orders -> Design Snapshot**: When an order is placed, the name and base price of the `Style` and `Fabric` are duplicated into the Order document. This is *intentional* so that if a Fabric's price increases tomorrow, historical orders maintain the price at the time of purchase.

**Reference Fields:**
- `customerId`, `batchId`, `styleId`, `fabricId` are correctly stored as foreign keys.

**Unnecessary Duplication:**
- `batchName` is sometimes stored in the Order. This could be resolved via join at the application layer to maintain a single source of truth.

---

## Section 7 — Firebase Storage

| Folder Path | Purpose | Related Collection |
| :--- | :--- | :--- |
| `fabrics/` | Fabric catalog images | `fabrics` |
| `styles/` | Style structural illustrations | `styles` |
| `designs/` | Curated design examples | `showpieces` |
| `logos/` | Business logos and branding | `settings` |
| `gallery/` | Uploaded images of participants | `communityPhotos` |
| `hero/` | Homepage hero banners | - |

**Naming Convention:** `[folder]/[sanitizedEntityId]/[sanitizedName]_[timestamp].[ext]`

---

## Section 8 — State Management

- **Zustand Store (`useAppStore.ts`)**: Acts as the single source of truth for the frontend UI.
- **`StorageService`**: Maps Zustand state to Firestore. Uses `onSnapshot` to set up real-time listeners for all Master Data collections upon application load (`initialize` method).
- **`MediaRepository`**: Abstracts Firebase Storage uploads and maintains the `media` metadata collection.

---

## Section 9 — Page Data Dependencies

- **Homepage**: Reads `settings`, `batches` (active batch), `communityPhotos`.
- **Lookbook**: Reads `showpieces`, `styles`, `fabrics`.
- **Design Studio**: Reads `styles`, `fabrics`, `batches` (active). Writes `orders`.
- **Database Hub (Admin)**: Reads and Writes `batches`, `fabrics`, `styles`, `showpieces`, `communityPhotos`, `settings`, `media`, `fabric_drafts`.
- **Dashboard (Customer)**: Reads `orders` (where customerId == currentUser), `batches`.

---

## Section 10 — Business Workflows

**Custom Order Workflow**
1. **Visitor** navigates to Design Studio.
2. **Selects Style** (Filters by Gender).
3. **Selects Fabric** (Filters by availability).
4. **Enters Measurements** & **Personal Details**.
5. **Checkout**: System calculates Total Price = Base Style Price + (Fabric Price * Required Yards) + Extras.
6. **Writes to `orders`**: Status set to 'Pending'.
7. **Production**: Admin updates Order and Batch status in Database Hub.
8. **Delivery**: Order marked as 'Collected'.

**Fabric AI Import Workflow**
1. **Agent** receives image in chat.
2. **Executes** `aiImportFabric.ts` script.
3. **Writes** to `fabric_drafts` collection.
4. **Database Hub** listener triggers UI popup for Admin review.
5. **Admin** clicks Save -> Writes to `fabrics`.

---

## Section 11 — Data Flow Diagrams

**Realtime Sync Flow**
```text
[Firestore Collection]
         ↓ (onSnapshot listener in StorageService)
[Zustand Store] (e.g., state.fabrics)
         ↓ (React hook: useAppStore(s => s.fabrics))
[React Component] (e.g., FabricSelector)
         ↓ (User Interaction)
[StorageService.saveFabrics()]
         ↓ (setDoc)
[Firestore Collection]
```

---

## Section 12 — Admin Features

- **Database Hub (`DatabaseView.tsx`)**: The central nervous system for admins.
  - **Permissions:** Restricted to users with Admin roles (verified via `AdminAuthGuard`).
  - **Capabilities:** CRUD operations for Batches, Fabrics, Styles, Showpieces, Photos, and Business Settings. Includes File Uploads via `MediaRepository`.

---

## Section 13 — Current Architecture Assessment

**Strengths:**
- Real-time synchronization using Firebase `onSnapshot` ensures all clients see the same data instantly.
- Clear abstraction layer (`StorageService`) separates UI from database implementation.
- Media handling is centralized in `MediaRepository`.

**Weaknesses & Technical Debt:**
- The Zustand store loads *all* collections into memory on startup. This works for thousands of records but will struggle with tens of thousands (e.g., historical orders).
- Missing robust server-side security rules for role-based access control (RBAC). Currently, auth is primarily client-side gated.

---

## Section 14 — Future Improvements

**High Priority (Immediate)**
1. **Pagination & Querying:** Modify `StorageService` to query `orders` and `communityPhotos` with limits and pagination rather than loading the entire collection.
2. **Security Rules:** Implement rigorous Firestore Security Rules to prevent unauthorized writes.

**Medium Priority (Long-term)**
1. **Pricing Master Normalization:** Migrate hardcoded base prices, accessories, extras, shipping algorithms, and discounts into a centralized Master Data schema to support dynamic business rules without code redeployments.
2. **Cloud Functions for Aggregation:** Move production statistics (New Participants, Dresses Made) calculations to Firebase Cloud Functions triggered on Order creation, rather than calculating client-side.

**Low Priority (Enterprise-scale)**
1. **Algolia / Typesense Integration:** Implement a dedicated search indexer for Fabrics and Orders to support robust fuzzy search.
2. **Audit Logging:** Implement a Cloud Function to automatically write to an `auditLogs` collection whenever Master Data is mutated.

---

## Section 15 — Glossary

- **Batch**: A defined production timeframe (e.g., "Group 5 - The Gladiators"). Orders are grouped into batches for manufacturing and shipping efficiency.
- **Showpiece**: A finished, professionally photographed garment used for marketing in the Lookbook.
- **Style Category**: The base structure of a garment (Agbada, Senator, Kaftan).
- **Fabric Draft**: A temporary AI-generated fabric record awaiting human approval.
- **New Participant**: A customer placing their first order in a specific batch.
- **Previous Participant (Returning)**: A customer who has ordered in a previous batch and is ordering again.
- **Master Order**: The top-level transaction record for a customer's purchase within a batch.
