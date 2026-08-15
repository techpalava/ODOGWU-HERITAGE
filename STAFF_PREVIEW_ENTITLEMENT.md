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

The maintenance command uses existing Firebase Admin credentials and accepts a
Firebase UID only:

```text
npm run staff-preview:entitlement -- inspect <firebaseUid>
npm run staff-preview:entitlement -- grant <firebaseUid> --confirm=<firebaseUid>
npm run staff-preview:entitlement -- revoke <firebaseUid> --confirm=<firebaseUid>
npm run staff-preview:entitlement -- reconcile <firebaseUid> --confirm=<firebaseUid>
```

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
