import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { Firestore } from "firebase-admin/firestore";
import { getProjectBoundAdminServices } from "../server/firebaseAdmin.js";
import { getCanonicalEmail } from "../security/authIdentity.js";

/**
 * One-off cleanup so older orders can be linked by indexed email lookups.
 *
 * Only orders WITHOUT an owner are considered (owned orders never need
 * linking). For each, `customer.email` is trimmed and lower-cased and
 * `customer.canonicalEmail` is filled in. Nothing else changes.
 *
 * Dry run by default: reads only and prints counts (never email addresses).
 *   npm run orders:normalize-email-case -- --project=<projectId>
 * Apply (writes):
 *   npm run orders:normalize-email-case -- --project=<projectId> --apply --confirm-project=<projectId>
 */
export type OrderEmailChange = {
  orderId: string;
  email: string;
  canonicalEmail: string;
};

export type OrderEmailPlan = {
  scanned: number;
  unowned: number;
  changes: OrderEmailChange[];
  skippedWithoutEmail: number;
};

export function planOrderEmailNormalization(
  orders: Array<{ id: string; data: Record<string, any> }>,
): OrderEmailPlan {
  const plan: OrderEmailPlan = {
    scanned: orders.length,
    unowned: 0,
    changes: [],
    skippedWithoutEmail: 0,
  };
  for (const order of orders) {
    if (order.data.ownerUid) continue;
    plan.unowned += 1;
    const rawEmail = order.data.customer?.email;
    if (typeof rawEmail !== "string" || !rawEmail.includes("@")) {
      plan.skippedWithoutEmail += 1;
      continue;
    }
    const email = rawEmail.trim().toLowerCase();
    const canonicalEmail = getCanonicalEmail(email);
    if (
      email !== rawEmail ||
      order.data.customer?.canonicalEmail !== canonicalEmail
    ) {
      plan.changes.push({ orderId: order.id, email, canonicalEmail });
    }
  }
  return plan;
}

export async function runOrderEmailNormalization(
  db: Firestore,
  options: { apply: boolean; log: (message: string) => void },
) {
  const snapshot = await db.collection("orders").get();
  const plan = planOrderEmailNormalization(
    snapshot.docs.map((document) => ({ id: document.id, data: document.data() })),
  );
  const uppercaseOnly = plan.changes.filter((change) => {
    const original = snapshot.docs
      .find((document) => document.id === change.orderId)
      ?.data().customer?.email;
    return original !== change.email;
  }).length;
  options.log(`Orders scanned: ${plan.scanned}`);
  options.log(`Orders without an owner: ${plan.unowned}`);
  options.log(`Unowned orders without a usable email: ${plan.skippedWithoutEmail}`);
  options.log(`Orders that would change: ${plan.changes.length}`);
  options.log(`  - email has capitals or spaces: ${uppercaseOnly}`);
  options.log(
    `  - only canonicalEmail missing or different: ${plan.changes.length - uppercaseOnly}`,
  );

  if (!options.apply) {
    options.log("Dry run: nothing was written.");
    return plan;
  }

  for (let offset = 0; offset < plan.changes.length; offset += 400) {
    const batch = db.batch();
    for (const change of plan.changes.slice(offset, offset + 400)) {
      batch.update(db.collection("orders").doc(change.orderId), {
        "customer.email": change.email,
        "customer.canonicalEmail": change.canonicalEmail,
      });
    }
    await batch.commit();
  }
  options.log(`Updated ${plan.changes.length} orders.`);
  return plan;
}

function readOption(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main(argv: string[]) {
  const projectId = readOption(argv, "project");
  if (!projectId) {
    throw new Error(
      "Usage: npm run orders:normalize-email-case -- --project=<projectId> [--apply --confirm-project=<projectId>]",
    );
  }
  const apply = argv.includes("--apply");
  if (apply && readOption(argv, "confirm-project") !== projectId) {
    throw new Error("--apply requires --confirm-project=<same projectId>.");
  }
  const { db } = getProjectBoundAdminServices(projectId);
  await runOrderEmailNormalization(db, { apply, log: console.log });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
