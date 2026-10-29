import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";
import {
  planOrderEmailNormalization,
  runOrderEmailNormalization,
} from "./src/scripts/normalizeOrderEmailCase";

const orders = [
  { id: "mixed", data: { customer: { email: " Ada.Lovelace@Gmail.com " } } },
  { id: "missing-canonical", data: { customer: { email: "bob@example.test" } } },
  { id: "already-clean", data: { customer: { email: "c@example.test", canonicalEmail: "c@example.test" } } },
  { id: "owned", data: { ownerUid: "u1", customer: { email: "OWNED@example.test" } } },
  { id: "no-email", data: { customer: {} } },
];

const plan = planOrderEmailNormalization(orders);
assert.equal(plan.scanned, 5);
assert.equal(plan.unowned, 4);
assert.equal(plan.skippedWithoutEmail, 1);
assert.deepEqual(plan.changes, [
  { orderId: "mixed", email: "ada.lovelace@gmail.com", canonicalEmail: "adalovelace@gmail.com" },
  { orderId: "missing-canonical", email: "bob@example.test", canonicalEmail: "bob@example.test" },
]);

// Dry run reads only.
let writes = 0;
const fakeDb = {
  collection: () => ({
    get: async () => ({ docs: orders.map((order) => ({ id: order.id, data: () => order.data })) }),
    doc: (id: string) => ({ id }),
  }),
  batch: () => ({
    update: () => {
      writes += 1;
    },
    commit: async () => undefined,
  }),
} as unknown as Firestore;
const lines: string[] = [];
await runOrderEmailNormalization(fakeDb, { apply: false, log: (line) => lines.push(line) });
assert.equal(writes, 0);
assert.ok(lines.includes("Orders that would change: 2"));
assert.ok(lines.includes("Dry run: nothing was written."));
assert.equal(lines.join("\n").includes("@"), false, "no email addresses in the output");

await runOrderEmailNormalization(fakeDb, { apply: true, log: () => undefined });
assert.equal(writes, 2);

console.log("PASS: order email-case cleanup plans, dry-runs and applies only unowned orders");
