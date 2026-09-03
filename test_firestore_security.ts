import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getCanonicalEmail,
  isAllowedAdminEmail,
} from "./src/security/authIdentity";
import {
  hashPin,
  validatePin,
  verifyPin,
} from "./src/server/customerAuth";

assert.equal(
  getCanonicalEmail("F.O.Startups+orders@googlemail.com"),
  "fostartups@gmail.com",
);
assert.equal(isAllowedAdminEmail("fostartups@gmail.com"), true);
assert.equal(isAllowedAdminEmail("customer@gmail.com"), false);

const pinHash = hashPin("4826", "0123456789abcdef0123456789abcdef");
assert.equal(verifyPin("4826", pinHash), true);
assert.equal(verifyPin("4827", pinHash), false);
assert.equal(validatePin("4826"), true);
assert.equal(validatePin("48261"), false);
assert.equal(validatePin("48a6"), false);

const rules = readFileSync("firestore.rules", "utf8");
assert.doesNotMatch(rules, /function isAdmin\(\)\s*\{\s*return true/);
assert.match(
  rules,
  /match \/customers\/\{customerId\} \{\s*allow read: if isAdmin\(\) \|\| ownsExistingDocument\(\)/,
);
assert.match(
  rules,
  /match \/orders\/\{orderId\} \{\s*allow read: if isAdmin\(\) \|\| ownsExistingDocument\(\)/,
);
assert.match(
  rules,
  /request\.auth\.token\.firebase\.sign_in_provider != "anonymous"/,
);
assert.match(rules, /request\.auth\.token\.admin == true/);
assert.match(rules, /resource\.data\.ownerUid == request\.auth\.uid/);
assert.match(rules, /request\.resource\.data\.ownerUid == request\.auth\.uid/);
assert.match(
  rules,
  /match \/fabric_drafts\/\{document=\*\*\}[\s\S]*?allow read, write: if isAdmin\(\)/,
);
assert.match(
  rules,
  /match \/futureDesignStudioDrafts\/\{ownerUid\} \{[\s\S]*?allow read: if isAdmin\(\) \|\| ownsDocumentPath\(ownerUid\)/,
);
assert.match(
  rules,
  /request\.auth\.uid == ownerUid/,
);
assert.match(
  rules,
  /request\.resource\.data\.revision == resource\.data\.revision \+ 1/,
);
assert.match(
  rules,
  /request\.resource\.data\.createdAt == resource\.data\.createdAt/,
);
assert.match(
  rules,
  /request\.resource\.data\.updatedAt == request\.time/,
);
assert.match(
  rules,
  /data\.lifecycleStatus == "cleared"[\s\S]*?!data\.keys\(\)\.hasAny\(\["draft"\]\)/,
);
assert.match(
  rules,
  /match \/futureDesignStudioDrafts\/\{ownerUid\}[\s\S]*?allow delete: if false/,
);
assert.match(
  rules,
  /match \/staffPreviewEntitlements\/\{ownerUid\} \{\s*allow get: if ownsDocumentPath\(ownerUid\);\s*allow list, create, update, delete: if false;/,
);
assert.match(rules, /function hasValidDesignStyleRecord\(data\)/);
assert.match(
  rules,
  /match \/styles\/\{styleId\} \{[\s\S]*?resource\.data\.lifecycle == "published"/,
);
assert.match(
  rules,
  /match \/styles\/\{styleId\} \{[\s\S]*?allow create: if isAdmin\(\) && hasValidDesignStyleCreate\(styleId\)/,
);
assert.match(
  rules,
  /request\.resource\.data\.publicRevision == resource\.data\.publicRevision \+ 1/,
);
assert.match(
  rules,
  /request\.resource\.data\.eligibilityRevision == resource\.data\.eligibilityRevision \+ 1/,
);
assert.match(rules, /isExplicitLegacyDesignStyleMigration\(styleId\)/);
assert.match(
  rules,
  /resource\.data\.fabricCapacityComposition\.size\(\) > 0/,
);
assert.match(rules, /!resource\.data\.keys\(\)\.hasAny\(\[/);
assert.match(
  rules,
  /match \/styles\/\{styleId\} \{[\s\S]*?allow delete: if false;/,
);

console.log("PASS: Firebase identity and Firestore rule security checks");
