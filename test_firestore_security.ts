import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { AuthorizationEngine } from "./src/engine/AuthorizationEngine";
import { getCanonicalEmail } from "./src/security/authIdentity";
import {
  ALLOWED_ADMIN_EMAILS,
  isAllowedAdminEmail,
} from "./src/server/adminAllowlist";
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
assert.equal(
  isAllowedAdminEmail("F.O.Startups+orders@googlemail.com"),
  true,
);
assert.equal(isAllowedAdminEmail("customer@gmail.com"), false);
assert.equal(isAllowedAdminEmail(""), false);
assert.equal(isAllowedAdminEmail(undefined), false);

const allowlistedCustomer = {
  name: "Allowlisted",
  email: ALLOWED_ADMIN_EMAILS[0],
  phone: "",
};
assert.equal(
  AuthorizationEngine.resolveRole(null),
  AuthorizationEngine.ROLES.GUEST,
);
assert.equal(
  AuthorizationEngine.resolveRole(allowlistedCustomer),
  AuthorizationEngine.ROLES.CUSTOMER,
  "an allowlisted email without a server role stays Customer",
);
assert.equal(
  AuthorizationEngine.canViewStaffDashboard(allowlistedCustomer),
  false,
);
assert.equal(
  AuthorizationEngine.resolveRole({
    ...allowlistedCustomer,
    role: "Super Administrator",
  }),
  AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR,
);
assert.equal(
  AuthorizationEngine.canViewStaffDashboard({
    ...allowlistedCustomer,
    role: "Super Administrator",
  }),
  true,
);
assert.equal(
  AuthorizationEngine.canManageSettings({
    ...allowlistedCustomer,
    role: "Super Administrator",
  }),
  true,
);
assert.equal(
  AuthorizationEngine.resolveRole({
    name: "Staff",
    email: "customer@gmail.com",
    phone: "",
    role: "Administrator",
  }),
  AuthorizationEngine.ROLES.ADMINISTRATOR,
);
assert.equal(
  AuthorizationEngine.resolveRole({
    ...allowlistedCustomer,
    role: "super administrator",
  }),
  AuthorizationEngine.ROLES.CUSTOMER,
  "only the exact server role string is elevated",
);
assert.equal(
  AuthorizationEngine.resolveRole({
    name: "Missing",
    email: "customer@gmail.com",
    phone: "",
  }),
  AuthorizationEngine.ROLES.CUSTOMER,
);
assert.equal("isAdminEmail" in AuthorizationEngine, false);
assert.equal("ALLOWED_ADMIN_EMAILS" in AuthorizationEngine, false);

const CLIENT_SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

function listClientSources(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "server") continue;
      files.push(...listClientSources(fullPath));
      continue;
    }
    if (CLIENT_SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const allowlistedAddresses = [
  ...new Set(
    ALLOWED_ADMIN_EMAILS.flatMap((email) => [
      email,
      getCanonicalEmail(email),
    ]),
  ),
];
const clientSources = listClientSources("src");
assert.ok(
  clientSources.some((file) => file.endsWith(`${path.sep}AuthorizationEngine.ts`)),
  "client scan must include the authorization engine",
);
assert.ok(
  clientSources.every((file) => !file.replace(/\\/g, "/").includes("/server/")),
  "client scan must not include server modules",
);

for (const file of clientSources) {
  const source = readFileSync(file, "utf8");
  const relative = file.replace(/\\/g, "/");
  assert.equal(
    source.includes("ALLOWED_ADMIN_EMAILS"),
    false,
    `${relative} must not reference ALLOWED_ADMIN_EMAILS`,
  );
  assert.equal(
    source.includes("isAllowedAdminEmail"),
    false,
    `${relative} must not reference isAllowedAdminEmail`,
  );
  assert.equal(
    source.includes("isAdminEmail"),
    false,
    `${relative} must not reference isAdminEmail`,
  );
  assert.equal(
    source.includes("adminAllowlist"),
    false,
    `${relative} must not import the server allowlist module`,
  );
  for (const address of allowlistedAddresses) {
    assert.equal(
      source.includes(address),
      false,
      `${relative} must not contain an admin allowlist address`,
    );
  }
}

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
  /match \/future_order_v2_payments\/\{orderId\} \{[\s\S]*?allow read: if isAdmin\(\) \|\| ownsExistingDocument\(\);[\s\S]*?allow write: if false;/,
);
assert.match(
  rules,
  /match \/future_order_v2_workshop\/\{orderId\} \{[\s\S]*?allow read: if isAdmin\(\) \|\| ownsExistingDocument\(\);[\s\S]*?allow create, update: if isAdmin\(\)[\s\S]*?pickupPin\.matches\('\^\[0-9\]\{6\}\$'\)[\s\S]*?pickupPin == ""[\s\S]*?dispatchStatus in \["not_dispatched", "dispatched", "arrived"\][\s\S]*?stageHistory is list[\s\S]*?stageHistory\.size\(\) >= 1[\s\S]*?stageHistory\.size\(\) <= 24[\s\S]*?stageHistory\.size\(\) - 1\]\.stage\s*== request\.resource\.data\.currentStage[\s\S]*?stageHistory\.size\(\) - 1\]\.status\s*== request\.resource\.data\.status[\s\S]*?allow delete: if false;/,
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
  /draft\.journeySchemaVersion == 1 \|\| draft\.journeySchemaVersion == 2/,
);
assert.match(
  rules,
  /"custom_details",\s*"personalized_additions",\s*"try_on"/,
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
