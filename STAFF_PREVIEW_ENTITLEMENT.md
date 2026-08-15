# Staff Preview Entitlement Operations

The dormant nine-stage Design Studio preview uses a server-controlled entitlement
record at `staffPreviewEntitlements/{firebaseUid}`. The Firebase UID in the
document path is the account authority. Email addresses and customer role fields
are not accepted as entitlement inputs.

The runtime authorization contract requires both:

- an active version 1 entitlement record; and
- a signed `staffPreview` version 1 custom claim whose `entitlementRevision`
  exactly matches the record revision.

A missing, malformed, revoked, or revision-mismatched record/claim pair is denied.

## Offline command

The maintenance command uses existing Firebase Admin credentials for
authentication, but the target project and Firebase UID must both be explicit:

```text
npm run staff-preview:entitlement -- inspect --project=<projectId> --uid=<firebaseUid>
npm run staff-preview:entitlement -- grant --project=<projectId> --uid=<firebaseUid> --confirm-project=<projectId> --confirm-uid=<firebaseUid>
npm run staff-preview:entitlement -- revoke --project=<projectId> --uid=<firebaseUid> --confirm-project=<projectId> --confirm-uid=<firebaseUid>
npm run staff-preview:entitlement -- reconcile --project=<projectId> --uid=<firebaseUid> --confirm-project=<projectId> --confirm-uid=<firebaseUid>
```

Obtain the Firebase UID from Firebase Authentication before running a command.
Email addresses and positional identifiers are rejected. Mutating commands
require exact project and UID confirmations. The CLI initializes a dedicated
Admin app with the supplied project ID and verifies that resolved project before
performing any Auth or Firestore operation. Environment credentials may
authenticate the operation, but environment or Firebase configuration values do
not choose the CLI target project.

`grant` and `revoke` update the entitlement record first. Claim or token failures
therefore remain fail-closed and are reported as partial failures. `reconcile`
repairs the claim from the current authoritative record without incrementing its
revision.

Setting a custom claim does not update an already-issued Firebase ID token. The
later runtime gate must force an ID-token refresh or require reauthentication
before treating a newly granted claim as available. Revocation changes the record
to `revoked` before clearing the claim and revoking refresh tokens, so an older
token cannot authorize against the current record.

These commands are not exposed through an HTTP route or browser interface.
