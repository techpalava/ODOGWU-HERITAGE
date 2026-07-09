# AUTHENTICATION_ARCHITECTURE_AUDIT

## Section 1: Authentication Overview
The current authentication system is a hybrid of native Firebase Authentication and custom client-side mock authentication. 
- **Authentication Providers Used:**
  - **Firebase Authentication (Google Sign-In)**: Used for accessing the Admin Portal and as an SSO option for customers.
  - **Firebase Anonymous Authentication**: Instantiated on app load for guests.
  - **Custom Client-Side Auth (Email/Phone + PIN)**: A completely simulated authentication mechanism where 4-digit PINs are verified locally against a client-side array of customers.

## Section 2: Registration Flow
1. **User Action**: Customer clicks "Register" and selects Email or Phone verification.
2. **Data Entry**: User enters Full Name, Email/Phone, and sets a 4-digit security PIN.
3. **Local Verification**: `LoginView` checks if the email or phone already exists in the `accounts` array (fetched from the Zustand store).
4. **Customer Creation**: A `Customer` object is instantiated locally with a default role (`"New Cohort Member"`) and `orderStatus` (`"Fresh Passport Activation"`).
5. **Database Write**: `setCustomers` is called, which updates the Zustand store and triggers `ApiService.saveAccounts`. This executes a batch overwrite to the Firestore `customers` collection using the user's `email` as the document ID. The PIN is stored in plain text.
6. **Session Initialization**: The `onLogin` callback fires, saving the user object to `localStorage` and updating the active user state.

## Section 3: Login Flow
1. **User Action**: Customer enters their email/phone and 4-digit PIN on the Login page.
2. **Authentication (Client-Side)**: `LoginView.handleSignIn` searches the local `accounts` array for a matching identifier and exactly matching `passcode`.
3. **Session Creation**: Upon match, `onLogin` is called. `App.tsx` receives the data, updates `currentUser` in the `useAppStore`, and calls `StorageService.saveSession(user)`.
4. **Storage**: The session is stored in the browser's `localStorage` under the key `ntcc_user`.
5. **Redirection**: The application checks `store.pendingRedirect`. If a path (like `design`) is pending, the user is navigated there. Otherwise, they are routed to the `dashboard`.

## Section 4: Session Lifecycle
- **Maintenance**: Sessions are maintained exclusively via `localStorage`.
- **Duration**: Indefinite. The session persists until the user manually logs out or clears browser data.
- **Restoration**: On page refresh, `useAppStore.initializeData` executes `ApiService.fetchSession()`, which parses `localStorage.getItem("ntcc_user")` and hydrates the `currentUser` state.
- **Logout**: Handled by `App.tsx.handleLogout`. It calls Firebase `signOut(auth)` (to clear any Google tokens) and `localStorage.removeItem("ntcc_user")`.

## Section 5: Role Architecture
- **Current Roles**: Roles such as `"New Cohort Member"` or `"Verified Google Client"` are hardcoded strings appended to the customer object during registration.
- **Permissions Assessment**: True role-based access control (RBAC) does not exist. 
- **Authorization Layer**: Authorization is entirely client-side. The Firestore rules currently define `isAdmin()` and `isCustomer()` as functions that unconditionally return `true`, effectively granting global read/write access to all collections regardless of role.

## Section 6: Route Protection Map
- **Customer Dashboard (`dashboard`)**: Guarded by conditional rendering in `App.tsx`. If `currentUser` is null, it renders `<LoginView>` instead of `<DashboardView>`.
- **Design Studio (`design`)**: Protected by an interceptor in `useAppStore.setActiveTab`. Attempting to navigate to `design` without a `currentUser` sets `pendingRedirect: "design"` and forces the tab to `"login"`.
- **Admin Portal (`DatabaseView`)**: Protected by `<AdminAuthGuard>`. 
  - *Critical Flaw*: The guard only verifies that a valid Firebase `User` object exists via `onAuthStateChanged`. It does not check if the email belongs to an authorized admin whitelist. Any user logging in with any Google account is granted full admin access.

## Section 7: User Journey Analysis
**Standard Journey**: Guest -> Login -> Customer Dashboard -> Design Studio -> Order -> Logout.
**Interrupted Journey (Guest -> Attempt Design -> Login -> Return to Design)**: 
The intended navigation is perfectly preserved. The `setActiveTab` function catches the unauthorized entry, registers a `pendingRedirect`, sends the user to login, and successfully routes them back to the Design Studio post-login.

## Section 8: Design Studio Entry Integration
When an unauthenticated visitor interacts with the Gallery (e.g., clicks "Design This Outfit"):
- The `GalleryView` successfully sets the `presetStyleId` and `presetFabricCode` in the Zustand store.
- It then calls `setActiveTab("design")`, triggering the login intercept.
- Because the preset selections are housed in the global Zustand store, they survive the login/registration flow. 
- Once authenticated, the user lands in the Design Studio with their selected fabric, style, and active batch perfectly preserved.

## Section 9: Firestore Relationship Map
- **Firebase Auth vs. Firestore**: They are completely disconnected. The `uid` generated by Firebase Auth (during Google Sign-In) is never stored or linked to the Firestore `customers` document.
- **Primary Key**: The application uses the customer's `email` address as the Document ID for the `customers` collection (`(a) => a.email`).
- **Duplicate Prevention**: Checked client-side only by searching the `accounts` array before registration.

## Section 10: Security Assessment
- **Plaintext Passwords**: User PINs (`passcode`) are stored in plaintext within the Firestore `customers` collection.
- **Client-Side Authentication**: Auth logic is executed in the browser. A malicious user could bypass the UI and manually set `localStorage.getItem("ntcc_user")`.
- **Broken Access Control**: The `AdminAuthGuard` grants administrative dashboard access to any Google account.
- **Firestore Security Rules**: The rules are currently open (`allow read, write: if true;` via the mock `isAdmin()` function). Any user with the project credentials can read, modify, or delete any document in the database.

## Section 11: UX Assessment
- **Registration**: The UI flow is extremely smooth. The simulated SMS OTP provides a convincing, albeit fake, verification experience.
- **Login**: Fast and responsive, though structurally insecure.
- **Google Login**: Functions well visually, but assigns arbitrary default data (e.g., `passcode: "1960"`) to force compatibility with the legacy PIN system.
- **Redirects**: The `pendingRedirect` mechanism works flawlessly, creating a highly cohesive user experience.

## Section 12: Enterprise Recommendations
To prepare the application for production, the following architectural upgrades are required:
1. **Authentication**: Migrate entirely to Firebase Authentication (Identity Platform) for all sign-in methods (Email/Password, Phone/SMS, Google). Remove all plaintext PINs from Firestore.
2. **Authorization**: Implement Firebase Custom Claims (e.g., `admin: true`, `staff: true`) to manage roles securely on the server.
3. **Session Management**: Rely on Firebase Auth ID tokens and `onAuthStateChanged` as the Single Source of Truth for session validity, deprecating the `localStorage` custom user object.
4. **User Profiles**: Create a `users/{uid}` collection mapping 1:1 with Firebase Auth UIDs. 
5. **Firestore Rules**: Lock down Firestore rules using `request.auth != null` and `request.auth.token.admin == true`.

## Priority Improvement Roadmap
1. **Phase 1**: Lock down `AdminAuthGuard` to verify against an explicit array of allowed administrator emails.
2. **Phase 2**: Secure `firestore.rules` to prevent public writes.
3. **Phase 3**: Refactor Customer Authentication to utilize Firebase Auth (Email/Password and Phone native providers).
4. **Phase 4**: Migrate existing `customers` data to map to Firebase UIDs.
