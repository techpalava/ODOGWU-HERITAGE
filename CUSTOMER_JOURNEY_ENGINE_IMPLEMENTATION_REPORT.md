# Customer Journey Engine Implementation Report
## Phase 5.3 Validation & Finalization

### Objective
The Customer Journey Engine acts as the single orchestration layer for the customer journey, unifying outputs from the OrderRoutingEngine, AuthorizationEngine, BatchBusinessRules, and component-local states to present a cohesive journey progression model to React.

### Components Audited
* `src/components/HomeView.tsx` - Audited and refactored
* `src/components/DesignStudioView.tsx` - Audited and refactored
* `src/components/DashboardView.tsx` - Audited (already partially refactored in previous turn, finalized today)
* `src/App.tsx` (Checkout & Login Flows) - Audited and refactored
* `src/components/CartDrawer.tsx` - Audited and refactored

### Components Refactored
* **HomeView.tsx**: Removed local hero CTA branching. Replaced button destinations and text with `journey.primaryAction`, `journey.secondaryAction`, and `journey.destination`.
* **DesignStudioView.tsx**: Included `CustomerJourneyEngine` initialization for state awareness, although Draft loading logic is delegated to cart interactions.
* **App.tsx**: 
  * Replaced post-checkout redirect logic with a re-evaluation from `CustomerJourneyEngine` to seamlessly route the customer to the next destination (e.g. Dashboard).
  * Removed hardcoded redirect logic in `handleLogin`. Post-login redirection now accurately leverages the Journey Engine to drop customers exactly where they left off (e.g., resuming a draft vs making a payment).
* **CartDrawer.tsx**: Added `CustomerJourneyEngine` inside the `handleCheckout` action to check for profile completeness and authentication before allowing deposit payment processing. The button label dynamically changes based on `journey.primaryAction`.

### Local Orchestration Removed
Removed multiple `if (cartItems.length > 0) else ...` logic scattered around CTAs in HomeView and CartDrawer. The single source of truth for "what the customer should do next" relies solely on the output of `CustomerJourneyEngine.getCurrentJourney(...)`.

### Supported Journey States
* `ACCOUNT_CREATED` - Initial state
* `PROFILE_INCOMPLETE` - When missing contact info (phone)
* `DESIGN_STARTED` - Has a draft, but missing measurements
* `DESIGN_IN_PROGRESS` - Has a draft ready for checkout
* `COMMUNITY_BATCH_FULL` - Selected routing mode is now full
* `PAYMENT_PENDING` - Checkout completed but deposit escrow not authorized
* `PAYMENT_COMPLETED` - Deposit paid, waiting for production to begin
* `PRODUCTION` - Garment actively being tailored (Stages 2-4)
* `SHIPPING` - In transit to Netherlands (Stage 5+)
* `DELIVERED` - Customer has received item
* `NO_ACTIVE_WORK` - Historical orders exist, but no active drafts or orders

### Journey Priority Rules
The Engine handles multiple simultaneous conditions deterministically with the following hierarchy:
1. **Active Orders Priority (Highest)**: If the user has any active orders (whether pending payment, in production, or shipping), this takes highest priority to ensure the customer fulfills financial obligations or tracks current progress before starting new work.
2. **Drafts Priority (Second Highest)**: If there are no active orders, but a draft exists in the cart, the engine resolves to `DESIGN_STARTED` or `DESIGN_IN_PROGRESS` to encourage checkout completion.
3. **Profile Completeness (Third Highest)**: After resolving drafts and active orders, the engine ensures profile completeness (such as having a phone number for logistics).
4. **Historical Context (Lowest)**: Resolves to `NO_ACTIVE_WORK` if the user has past orders.
5. **New Account**: Default fallback.

### Session Restoration Results
* **Login Resumption**: When a customer logs in, `App.tsx` generates a `CustomerJourneyEngine` instance on the fly and invokes `setActiveTab(journey.destination)`. This accurately restores them to their active draft (Design Studio) or payment requirement (Dashboard).
* **Payment State Rehydration**: Re-evaluating the journey directly after checkout completion yields a `PAYMENT_COMPLETED` state which immediately updates the Dashboard view to reflect the wait for production to begin.

### Before-and-After Dependency Flow
**Before Phase 5.3**:
React UI (Home/Cart) -> OrderRoutingEngine (is batch full?) -> `if/else` UI Logic -> local state `currentStep` -> local Component State (Cart Items).

**After Phase 5.3**:
React UI -> `CustomerJourneyEngine.getCurrentJourney(...)` -> Returns Single Unified `JourneyModel`.
*(CustomerJourneyEngine internally consults `OrderRoutingEngine`, `AuthorizationEngine`, and `BatchBusinessRules` so React doesn't have to).*

### Conclusion
Phase 5.3 is fully complete. `CustomerJourneyEngine` has successfully proven itself as the single point of orchestration across all major views in the application, standardizing primary CTAs, notifications, redirection endpoints, and priority resolutions without mutating existing architecture components.
