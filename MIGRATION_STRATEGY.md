# NTCC / Odogwu Heritage - Migration Strategy & Change Management Manual

## Table of Contents
1. [Section 1 — Purpose](#section-1--purpose)
2. [Section 2 — Current Architecture Baseline](#section-2--current-architecture-baseline)
3. [Section 3 — Versioning Strategy](#section-3--versioning-strategy)
4. [Section 4 — Migration Types](#section-4--migration-types)
5. [Section 5 — Backward Compatibility](#section-5--backward-compatibility)
6. [Section 6 — Data Migration Process](#section-6--data-migration-process)
7. [Section 7 — Firestore Migrations](#section-7--firestore-migrations)
8. [Section 8 — Firebase Storage Migrations](#section-8--firebase-storage-migrations)
9. [Section 9 — State Management Migrations](#section-9--state-management-migrations)
10. [Section 10 — Feature Migration Checklist](#section-10--feature-migration-checklist)
11. [Section 11 — Testing Strategy](#section-11--testing-strategy)
12. [Section 12 — Rollback Strategy](#section-12--rollback-strategy)
13. [Section 13 — Change Log](#section-13--change-log)
14. [Section 14 — Future Roadmap](#section-14--future-roadmap)
15. [Section 15 — Migration Governance](#section-15--migration-governance)

---

## Section 1 — Purpose

### Why a Migration Strategy is Necessary
As the NTCC / Odogwu Heritage platform evolves, the underlying database schemas, state management, and architecture must adapt to support new features and scalability. A formalized migration strategy ensures that these changes occur smoothly without disrupting operations.

### Risks of Unplanned Changes
- **Data Corruption**: Modifying fields or relationships without migrating legacy documents can cause frontend crashes.
- **Inconsistent State**: Differences between the Zustand store and Firestore can lead to "ghost" data or lost updates.
- **Downtime**: Unplanned migrations that lock collections or cause excessive reads can result in temporary outages and degraded performance.

### Goals of Safe Migrations
- **Zero Downtime**: Migrations should ideally occur without taking the platform offline.
- **Data Integrity**: Guarantee that no customer or order data is lost or improperly mutated.
- **Traceability**: Maintain a clear history of all structural changes for debugging and onboarding.

### Principles of Backward Compatibility
Always assume that older versions of the frontend application might still be running in a user's browser cache. Schema changes must be additive first, destructive second (often weeks later).

---

## Section 2 — Current Architecture Baseline

**Version 1.0 Baseline (Current State)**

Based on `DATA_DICTIONARY.md` and `COMPLIANCE_AUDIT.md`:
- **Current Firestore Collections**: `batches`, `fabrics`, `styles`, `customers`, `orders`, `showpieces`, `communityPhotos`, `fabric_drafts`, `settings`, `media`.
- **Firebase Storage Structure**: Folders for `fabrics/`, `styles/`, `designs/`, `logos/`, `gallery/`, `hero/`.
- **State Management**: Centralized via Zustand (`useAppStore.ts`), relying heavily on `StorageService.ts` for full-collection `onSnapshot` listeners.
- **Authentication**: Firebase Auth (Google Provider) linked to `customers` collection.
- **Media Repository**: Abstracted upload and metadata tracking via `MediaRepository.ts`.
- **Master Data**: `batches`, `fabrics`, `styles`, and `settings` act as authoritative sources for the app.

---

## Section 3 — Versioning Strategy

To maintain clarity, the platform uses a semantic versioning approach for both Architecture and Database Schema.

### Versioning Standard
- **Architecture Versioning (e.g., v1.x.x)**: Tracks major shifts in how the app is built (e.g., moving from client-side calculations to Cloud Functions).
- **Database Schema Versioning (e.g., Schema vX)**: Tracks structural changes to Firestore collections.

| Architecture | Database Schema | Description |
|:---|:---|:---|
| v1.0 | v1 | Baseline release. |
| v1.1 | v2 | Introduction of `reference_data` collection. |
| v2.0 | v3 | Shift to paginated queries & Cloud Functions. |

**Tracking Schema Versions**: Add a `_schemaVersion` integer field to all new or migrated documents.

---

## Section 4 — Migration Types

### Adding New Fields
- **Action**: Add field to the TypeScript interface as `Optional`.
- **Migration**: Deploy frontend. Write a background script to populate the field on legacy documents with default values if necessary.

### Removing Fields
- **Action**: Mark field as `@deprecated` in TypeScript. Ensure UI no longer relies on it.
- **Migration**: Deploy frontend. Wait 1 week. Run a background script to delete the field from all documents. Remove from TypeScript.

### Renaming Fields
- **Action**: Add new field. Update frontend to write to BOTH fields, but read from the NEW field (falling back to OLD field if NEW is undefined).
- **Migration**: Run a script to copy OLD data to NEW field across all documents. Deploy frontend to only use NEW field. Run script to delete OLD field.

### Splitting / Merging Collections
- **Action**: Requires dual-writing during the transition period and an extensive backfill script.

### Snapshot vs. Reference Changes
- **Reference-to-Snapshot**: When prices need to be frozen at checkout (e.g., Order items). Easy to implement on new documents. Legacy documents remain reference-based unless specifically backfilled.
- **Snapshot-to-Reference**: When duplicated data (e.g., `batchName` in Orders) needs to be normalized. Requires a UI update to perform the join, followed by a script to remove the snapshot string.

---

## Section 5 — Backward Compatibility

To ensure older clients do not break when the database changes:

1. **Missing Fields**: The UI must handle `undefined` or `null` gracefully for any newly added fields.
2. **Legacy Documents**: Must continue to render in the UI. If a required field was added in Schema v2, the UI must provide a sane default for Schema v1 documents.
3. **Grace Periods**: Never delete a deprecated field immediately. Wait a minimum of 7 days (or 1 full Batch lifecycle) to ensure all clients have received the new frontend code.
4. **Default Values**: Rely on TypeScript defaults or Zustand initialization defaults to handle sparse documents.

---

## Section 6 — Data Migration Process

```text
Plan → Review → Backup → Development → Testing → Migration Script → Validation → Production Deployment → Post-Migration Verification
```

1. **Plan**: Define the schema changes in a proposal.
2. **Review**: Ensure compliance with `DATA_DICTIONARY.md`.
3. **Backup**: Export the Firestore database using Google Cloud Console.
4. **Development**: Update TypeScript interfaces and Zustand store.
5. **Testing**: Run against a staging project or local emulator.
6. **Migration Script**: Write an idempotent Node.js script (using Firebase Admin SDK) to mutate the data.
7. **Validation**: Dry-run the script.
8. **Production Deployment**: Deploy the frontend changes.
9. **Post-Migration Verification**: Execute the script and verify logs.

---

## Section 7 — Firestore Migrations

**Best Practices for Migration Scripts:**
- Use the **Firebase Admin SDK** in a secure Node.js environment.
- Use `db.runTransaction()` or `batch()` for atomic updates.
- Process documents in chunks (e.g., batches of 500) to avoid memory limits and timeout errors.
- Always include a dry-run flag (`if (!dryRun) batch.commit()`).
- Log the ID of every modified document to a local JSON file for audit purposes.

**Rollback capability**: Scripts should ideally have an inverse operation (e.g., if adding a default field, the rollback script deletes that field).

---

## Section 8 — Firebase Storage Migrations

When moving, renaming, or restructuring media:

1. **Upload New File**: Upload the asset to the new path.
2. **Update Metadata**: Update the `media` collection and any referencing documents (e.g., `fabrics.imageUrl`) to point to the new URL.
3. **Cleanup**: Only delete the old file after verifying the new URL is live and all references are updated.

*Never delete a file before its references in Firestore have been completely replaced.*

---

## Section 9 — State Management Migrations

Updating Zustand and `StorageService`:

1. **Store Evolution**: When adding a new slice to `useAppStore`, ensure the default state is empty/null.
2. **Listener Management**: If moving from `onSnapshot` to paginated `getDocs`, introduce the new fetch method alongside the old listener. Transition components one by one.
3. **Caching**: Ensure that `localStorage` or `sessionStorage` persistence (if added) gracefully handles schema version mismatches by purging the local cache if the schema version increments.

---

## Section 10 — Feature Migration Checklist

Before implementing any feature that modifies the database:

- [ ] Data Dictionary updated
- [ ] Architecture Standards followed
- [ ] Firestore impact reviewed (Reads/Writes limit)
- [ ] Storage impact reviewed
- [ ] Relationships documented
- [ ] Migration script required & written?
- [ ] Rollback strategy defined?
- [ ] Security rules reviewed/updated?
- [ ] Performance impact assessed?
- [ ] Documentation updated?

---

## Section 11 — Testing Strategy

- **Unit Tests**: Verify TypeScript interfaces match expected JSON payloads.
- **Firestore Validation**: Use Firebase Local Emulator Suite to test Security Rules against the new schema.
- **UI Validation**: Manually test the frontend with a mix of Schema v1 and Schema v2 documents to ensure graceful degradation.
- **Dry-Run Testing**: Execute migration scripts with `commit = false` to verify querying and transformation logic without altering production data.

---

## Section 12 — Rollback Strategy

In the event of a failed or corrupting migration:

1. **Stop Writes**: If catastrophic, temporarily disable writes via Firebase Security Rules.
2. **Deploy Reversion**: Revert the frontend deployment to the previous commit.
3. **Execute Rollback Script**: Run the inverse migration script to remove new fields or restore old relationships.
4. **Restore from Backup**: If data was irreparably mutated or deleted, use the GCP Firestore Export/Import tool to restore the collection from the pre-migration backup.

---

## Section 13 — Change Log

*(Template for recording future migrations)*

| Version | Date | Author | Collections Affected | Fields Added/Removed | Script Ref | Notes |
|:---|:---|:---|:---|:---|:---|:---|
| v1.0 | 2026-07-02 | Admin | All | Initial schema | N/A | Baseline established. |
| v1.1 | 2026-07-02 | AI Agent | `reference_data` | Added | `seedReferenceData.ts` | Centralized hardcoded categories and dropdown options into reference_data collection (Phase 2A). |

---

## Section 14 — Future Roadmap

Based on the `COMPLIANCE_AUDIT.md`, the following migrations are recommended.

### Immediate Priority
- **Purpose**: Implement robust Firestore Security Rules.
- **Action**: Write `.rules` file defining Role-Based Access Control. No data migration needed, but requires extensive testing.
- **Risk**: High (could lock out users if misconfigured).

### Near-Term Priority
- **Purpose**: Fix state management scalability.
- **Action**: Migrate `orders` and `communityPhotos` in `StorageService` from `onSnapshot` to paginated `getDocs`.
- **Benefit**: Reduces Firestore read costs and client memory usage.

### Long-Term Priority
- **Purpose**: Normalize Pricing Master.
- **Action**: Migrate UI to read pricing algorithms and configurations from a centralized master data schema instead of hardcoded rules.
- **Benefit**: Allows admins to update pricing without code deployments.

### Enterprise Scale
- **Purpose**: Offload calculations to Cloud Functions.
- **Action**: Migrate production stats (`newParticipants`, `dressesMade`) from client-side calculation to Firebase Cloud Functions triggered by Order writes.
- **Benefit**: True enterprise scalability and guaranteed data integrity.

---

## Section 15 — Migration Governance

All developers and administrators MUST adhere to the following governance rules:

1. **No undocumented schema changes.** 
2. **No new collections without justification** and inclusion in the Data Dictionary.
3. **Master data must remain centralized.** Do not duplicate fabric stock or style prices outside their master collections.
4. **Maintain backward compatibility** for at least one full production batch cycle.
5. **Every structural change requires validation** in a staging/emulator environment.
6. **Every migration must result in updates to:**
   - `DATA_DICTIONARY.md`
   - `COMPLIANCE_AUDIT.md` (if applicable)
   - `MIGRATION_STRATEGY.md` (Change Log section)
