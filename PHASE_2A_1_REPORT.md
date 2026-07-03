# Phase 2A.1 Architecture Enhancement Report

## Objective
Enhance the Reference Data architecture by separating machine-readable identifiers (codes) from user-facing display labels, allowing display text to change freely without affecting business logic or application behavior.

## Reference Data Modules Updated
The pattern was consistently applied to the following modules in `src/scripts/seedReferenceData.ts` and `src/types.ts`:
- Batch Statuses
- Fabric Categories
- Fabric Stock Status
- Visibility (Public/Private)
- Genders
- Gallery Categories
- Outfit Types
- Garment Compositions
- Countries
- Delivery Months

## Migration Strategy Used
- Added a `code` field to the `ReferenceOption` type in `src/types.ts`.
- Updated `src/scripts/seedReferenceData.ts` to assign permanent internal codes (e.g., `OPEN`, `IN_STOCK`, `MALE`) to all seeded reference data options.
- The `value` field is kept internally in the data structures (or mapped from code if missing) to ensure backward compatibility for any UI elements that haven't been updated to use the code field, but new logic should rely on `code`.
- Updated UI logic to map new code fields properly without breaking existing views.
- Modified types across the app to expect the `code` string values instead of the old title-case string values.

## Legacy Compatibility Handling
Implemented a compatibility layer (`src/utils/legacyCompat.ts`) that runs automatically whenever data is fetched from Firestore via `storageService.ts`.
- `legacyCompatMap()` takes incoming data and recursively inspects properties like `status`, `visibility`, `category`, etc.
- If it finds legacy values (e.g., `"Open For Orders"` or `"Draft"`), it automatically converts them to their standard internal `code` counterparts (e.g., `"OPEN"`, `"DRAFT"`).
- This ensures existing Firestore documents don't break the application, avoiding the need for manual database updates.

## Components Affected
- `src/types.ts`: Updated business types and enums to rely on codes (e.g. `BatchStatus`, `Visibility`).
- `src/hooks/useReferenceData.ts`: Enhanced to safely inject both code and value into reference options.
- `src/services/storageService.ts`: Intercepts `getDocs` and `onSnapshot` queries to apply the legacy compatibility mapper.
- Various UI Components (`DatabaseView`, `DashboardView`, `CustomOrderView`, `DesignStudioView`, `GalleryView`, `mockData.ts`): Refactored to replace display string comparisons with stable internal code comparisons.

## Future Benefits
- **Zero-Downtime Rebranding**: Admins can safely update any label (e.g. "Public" to "Open to Public") without updating logic or records.
- **Robustness**: Hardcoded business logic (like `if (status === "OPEN")`) is no longer brittle.
- **Data Consistency**: New orders, queries, and reports will all store standard identifiers.
