# Dormant Staff Preview Client Gate

The client gate is a dormant, fail-closed foundation for the future nine-stage
Design Studio. It is not connected to `App.tsx`, does not expose a preview route
or control, and does not activate the future journey in production.

`VITE_ENABLE_DESIGN_STUDIO_STAFF_PREVIEW` is enabled only by the exact string
`true`. Missing, empty, differently cased, or otherwise malformed values are
disabled. Query parameters, cookies, and browser storage are not read as flag
sources. The flag is only a rollout condition and never grants access.

Authorization requires a signed-in, non-anonymous Firebase user; matching
Firebase and application customer UIDs; matching canonical emails; a freshly
refreshed ID token with a valid `staffPreview` claim; and the user's own active
`staffPreviewEntitlements/{uid}` record with an exactly matching revision. The
client subscribes only to that UID's record. Revocation, revision changes,
malformed data, listener failures, account changes, and late responses fail
closed.

The controller invalidates the previous generation and removes its listener
before evaluating another identity. It does not persist authorization. Future
draft loading is allowed by the domain contract only while the state is exactly
`authorized`.

Each published result is bound to the exact feature, Firebase identity,
application-customer identity, canonical-email, and controller context that
produced it. A render with a different context synchronously falls back to a
non-authorized state before asynchronous reevaluation begins.

The gate protects entry to the official preview flow. Firebase rules and server
authorization remain responsible for protecting privileged records and
operations. Client-side gating cannot prevent a determined user from modifying
code in their own browser. Grants and revocations remain offline Admin
operations.
