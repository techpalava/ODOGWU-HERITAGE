# Capacity Allocation Strategy

This document defines the architectural and business-rule design for how garment capacity is allocated, tracked, adjusted, and reported throughout the Odogwu Heritage platform. 

The primary business rule driving this strategy is: **Only paid garments (or explicitly authorized manual reservations) consume community batch capacity.**

## 1. Official Business Definitions

- **Target Capacity (`targetGarments`)**: The maximum number of garments a specific Community Batch can support before becoming `FULL`.
- **Reserved Capacity (`committedGarments`)**: The total number of garment slots that have been successfully claimed. This is a *computed* value, never a raw editable field.
- **Remaining Capacity (`remainingGarments`)**: The number of slots still available (`Target Capacity - Reserved Capacity`).
- **Online Order Allocation**: Capacity reserved automatically by the system upon successful payment of an online order.
- **Manual Adjustment Allocation**: Capacity reserved or released manually by an administrator to account for offline sales, VIP reservations, or administrative corrections.
- **Audit Ledger**: An immutable log of all events (online orders and manual adjustments) that affect the reserved capacity of a batch.

## 2. Ownership Diagram

```text
┌─────────────────────────────────┐
│        Event Sources            │
│ 1. Payment Webhooks (Stripe)    │
│ 2. Admin Adjustments (Offline)  │
│ 3. Order Cancellations/Refunds  │
└─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│     Capacity Ledger Engine      │
│  (Proposed: src/engine)         │
│  Owns: Immutably recording      │
│        capacity events.         │
└─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│      BatchProgressEngine        │
│  (src/engine)                   │
│  Owns: Computing current totals,│
│        Ratios, Capacity bounds  │
└─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│        React Components         │
│  (HomeView, DashboardView, etc) │
│  Owns: Rendering UI             │
└─────────────────────────────────┘
```

## 3. Recommended Architecture & Data Flow

Instead of storing `currentGarments` as a mutable integer on the Batch document, the system should adopt an **Event-Sourced Ledger** for capacity.

### What Computes vs. What Stores
- **Stored**: The Batch document stores the `targetGarments`. It does *not* store the hardcoded `currentGarments`. Instead, the database stores a subcollection of `CapacityEvents`.
- **Computed**: The `BatchProgressEngine` dynamically computes `committedGarments` by summing the values of all `CapacityEvents` associated with that batch.
- **Engine Ownership**: 
    - `CapacityLedgerEngine` (Proposed): Validates and writes allocation/release events to the database.
    - `BatchProgressEngine` (Existing): Reads the aggregated ledger totals and computes UI metrics (`remainingGarments`, `completionPercentage`, `capacityStatus`).

### Trigger Rules
- **What Reserves Capacity**: 
  - Successful online payments (`+N` garments).
  - Manual reservations for offline orders (`+N` garments).
- **What Releases Capacity**:
  - Cancelled online orders (`-N` garments).
  - Refunded garments (`-N` garments).
  - Manual administrative releases (`-N` garments).

## 4. Manual Adjustment Strategy

To handle offline payments and manual reservations without compromising the computed totals, administrators will not overwrite the `currentGarments` integer directly. Instead, they will append a **Structured Capacity Adjustment** to the ledger.

Every manual adjustment must capture the following schema:
- **Quantity**: The number of garments added (positive integer) or released (negative integer).
- **Reason**: A categorized reason (e.g., "OFFLINE_SALE", "VIP_RESERVATION", "CORRECTION", "CUSTOMER_CANCELLATION").
- **Administrator**: The ID/Name of the staff member making the adjustment.
- **Timestamp**: The exact date and time of the adjustment.
- **Optional Notes**: A text field for reference IDs (e.g., "Bank transfer ref: 12345", "Reserved for Chief O").

## 5. Auditability

By storing capacity modifications as a ledger of immutable events rather than a single overwritable number, the platform achieves complete auditability. 

If `Reserved Capacity` is 45, an administrator can view the ledger to see:
- `+40` (Online Orders)
- `+5` (Manual: Offline Bank Transfer by Admin A)
- `+2` (Manual: VIP Hold by Admin B)
- `-2` (Online Order Cancelled/Refunded)

This guarantees that the computed capacity exactly matches the business reality and financial records, eliminating "phantom" garments that block online sales.

## 6. Future Implementation Roadmap

1. **Phase 4.7.1**: Design the `CapacityEvent` interface in `src/types.ts`.
2. **Phase 4.7.2**: Create the `CapacityLedgerEngine` to handle the generation and validation of ledger events.
3. **Phase 4.7.3**: Update `BatchProgressEngine` to accept an array of events and sum them, rather than relying on a static `currentGarments` property.
4. **Phase 4.7.4**: Build the "Capacity Adjustments" UI panel in the `BatchManagementPanel` to allow admins to log manual capacity events.
5. **Phase 4.7.5**: Migrate existing `currentGarments` integers into a baseline `CapacityEvent` for all historical batches to maintain backward compatibility.
