import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  StaffPreviewCliArgumentError,
  executeStaffPreviewEntitlementCli,
  parseStaffPreviewEntitlementArguments,
} from "./src/scripts/manageStaffPreviewEntitlement";
import type {
  StaffPreviewInspection,
  StaffPreviewMutationOutcome,
} from "./src/server/staffPreviewEntitlement";

const PROJECT = "demo-odogwu-future-drafts";
const UID = "preview-staff-uid";

const mutationOutcome = (
  operation: "grant" | "revoke" | "reconcile",
): StaffPreviewMutationOutcome => {
  const entitlement =
    operation === "revoke"
      ? ({
          schemaVersion: 1,
          capability: "design_studio_nine_stage_preview",
          status: "revoked",
          revision: 2,
          createdAt: { toMillis: () => 1 },
          updatedAt: { toMillis: () => 2 },
          grantedAt: { toMillis: () => 1 },
          revokedAt: { toMillis: () => 2 },
        } as const)
      : ({
          schemaVersion: 1,
          capability: "design_studio_nine_stage_preview",
          status: "active",
          revision: 2,
          createdAt: { toMillis: () => 1 },
          updatedAt: { toMillis: () => 2 },
          grantedAt: { toMillis: () => 1 },
        } as const);
  return {
    operation,
    status: "complete",
    entitlement,
    claimSynchronized: true,
    refreshTokensRevoked: operation === "revoke" ? true : null,
    issues: [],
  };
};

const inspection: StaffPreviewInspection = {
  uid: UID,
  entitlement: null,
  claim: null,
  authorization: {
    authorized: false,
    reason: "ENTITLEMENT_MISSING",
    entitlementRevision: null,
  },
};

const validArgs = (command: "grant" | "revoke" | "reconcile") => [
  command,
  `--project=${PROJECT}`,
  `--uid=${UID}`,
  `--confirm-project=${PROJECT}`,
  `--confirm-uid=${UID}`,
];

const invalidArgvCases = [
  ["inspect", `--uid=${UID}`],
  ["inspect", `--project=${PROJECT}`],
  ["inspect", `--project=${PROJECT}`, "person@example.com"],
  ["inspect", `--project=${PROJECT}`, "--uid=person@example.com"],
  ["grant", `--project=${PROJECT}`, `--uid=${UID}`],
  [
    "grant",
    `--project=${PROJECT}`,
    `--uid=${UID}`,
    "--confirm-project=another-demo-project",
    `--confirm-uid=${UID}`,
  ],
  [
    "grant",
    `--project=${PROJECT}`,
    `--uid=${UID}`,
    `--confirm-project=${PROJECT}`,
    "--confirm-uid=another-uid",
  ],
  ["inspect", `--project=${PROJECT}`, `--uid=${UID}`, "--unknown=value"],
  ["inspect", `--project=${PROJECT}`, `--uid=${UID}`, "extra-value"],
  ["inspect", `--project=${PROJECT}`, `--uid= ${UID}`],
  ["inspect", `--project=${PROJECT}`, `--uid=${"x".repeat(129)}`],
  ["inspect", `--project=${PROJECT}`, "--uid=control\u0007uid"],
] as const;

for (const argv of invalidArgvCases) {
  assert.throws(
    () => parseStaffPreviewEntitlementArguments([...argv]),
    StaffPreviewCliArgumentError,
  );
}

const createHarness = ({ resolvedProject = PROJECT } = {}) => {
  const logs: string[] = [];
  const calls = {
    initialize: 0,
    createService: 0,
    grant: 0,
    revoke: 0,
    inspect: 0,
    reconcile: 0,
  };
  const service = {
    async grant(uid: string) {
      calls.grant += 1;
      assert.equal(uid, UID);
      return mutationOutcome("grant");
    },
    async revoke(uid: string) {
      calls.revoke += 1;
      assert.equal(uid, UID);
      return mutationOutcome("revoke");
    },
    async inspect(uid: string) {
      calls.inspect += 1;
      assert.equal(uid, UID);
      return inspection;
    },
    async reconcile(uid: string) {
      calls.reconcile += 1;
      assert.equal(uid, UID);
      return mutationOutcome("reconcile");
    },
  };
  return {
    logs,
    calls,
    dependencies: {
      getProjectServices(projectId: string) {
        calls.initialize += 1;
        assert.equal(projectId, PROJECT);
        return {
          projectId: resolvedProject,
          auth: {} as never,
          db: {} as never,
        };
      },
      createService() {
        calls.createService += 1;
        return service;
      },
      log(message: string) {
        logs.push(message);
      },
    },
  };
};

for (const argv of invalidArgvCases) {
  const harness = createHarness();
  await assert.rejects(
    executeStaffPreviewEntitlementCli([...argv], harness.dependencies),
    StaffPreviewCliArgumentError,
  );
  assert.deepEqual(harness.calls, {
    initialize: 0,
    createService: 0,
    grant: 0,
    revoke: 0,
    inspect: 0,
    reconcile: 0,
  });
}

{
  const previousProject = process.env.FIREBASE_ADMIN_PROJECT_ID;
  process.env.FIREBASE_ADMIN_PROJECT_ID = "wrong-environment-project";
  const harness = createHarness();
  await executeStaffPreviewEntitlementCli(validArgs("grant"), harness.dependencies);
  assert.equal(harness.calls.initialize, 1);
  if (previousProject === undefined) {
    delete process.env.FIREBASE_ADMIN_PROJECT_ID;
  } else {
    process.env.FIREBASE_ADMIN_PROJECT_ID = previousProject;
  }
}

{
  const harness = createHarness({ resolvedProject: "different-demo-project" });
  await assert.rejects(
    executeStaffPreviewEntitlementCli(validArgs("grant"), harness.dependencies),
    /does not match --project/,
  );
  assert.equal(harness.calls.initialize, 1);
  assert.equal(harness.calls.createService, 0);
  assert.equal(harness.calls.grant, 0);
}

for (const command of ["grant", "revoke", "reconcile"] as const) {
  const harness = createHarness();
  const exitCode = await executeStaffPreviewEntitlementCli(
    validArgs(command),
    harness.dependencies,
  );
  assert.equal(exitCode, 0);
  assert.equal(harness.calls[command], 1);
  assert.equal(harness.logs.length, 2);
  const intent = JSON.parse(harness.logs[0]);
  assert.deepEqual(intent, {
    intendedAction: command,
    firebaseProjectId: PROJECT,
    targetUid: UID,
    confirmationSucceeded: true,
  });
  const output = harness.logs.join("\n");
  assert.doesNotMatch(output, /PRIVATE KEY|credential|customClaims|preserve-me/i);
}

{
  const harness = createHarness();
  const exitCode = await executeStaffPreviewEntitlementCli(
    ["inspect", `--project=${PROJECT}`, `--uid=${UID}`],
    harness.dependencies,
  );
  assert.equal(exitCode, 0);
  assert.equal(harness.calls.inspect, 1);
  assert.equal(harness.calls.grant, 0);
  assert.equal(harness.calls.revoke, 0);
  assert.equal(harness.calls.reconcile, 0);
  assert.deepEqual(JSON.parse(harness.logs[0]), {
    intendedAction: "inspect",
    firebaseProjectId: PROJECT,
    targetUid: UID,
    confirmationSucceeded: false,
  });
}

const adminSource = readFileSync("src/server/firebaseAdmin.ts", "utf8");
const projectBoundSource = adminSource.slice(
  adminSource.indexOf("function getProjectBoundAdminApp"),
  adminSource.indexOf("export function getAdminServices()"),
);
assert.doesNotMatch(projectBoundSource, /FIREBASE_ADMIN_PROJECT_ID/);
assert.doesNotMatch(projectBoundSource, /firebaseConfig\.projectId/);
assert.match(projectBoundSource, /projectId,/);

console.log("Staff preview entitlement CLI safety tests passed.");
