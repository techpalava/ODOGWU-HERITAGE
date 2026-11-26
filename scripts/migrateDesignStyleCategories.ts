/**
 * Dry-run-first migration for mapping legacy `styles[].designCategories` strings
 * onto structured `design_style_categories` IDs (`categoryIds`) while keeping
 * `designCategories` populated as a normalized "Long Shirt" legacy mirror.
 *
 * Dry run (default — reads only, writes nothing):
 *   npx tsx scripts/migrateDesignStyleCategories.ts
 *   npx tsx scripts/migrateDesignStyleCategories.ts --project=<projectId>
 *
 * Apply (requires explicit `--apply`, `--project`, and `--confirm-project`, plus Admin SDK credentials):
 *   npx tsx scripts/migrateDesignStyleCategories.ts --apply --project=<projectId> --confirm-project=<projectId>
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { initializeApp } from "firebase/app";
import {
  collection as clientCollection,
  getDocs as clientGetDocs,
  getFirestore as clientGetFirestore,
} from "firebase/firestore";
import committedStagingConfig from "../firebase-applet-config.json" with {
  type: "json",
};
import { getProjectBoundAdminServices } from "../src/server/firebaseAdmin.js";
import type { DesignStyleCategory } from "../src/types.js";
import {
  parseAuthoritativeDesignStyleRecord,
  prepareAuthoritativeDesignStyleRecord,
  projectDesignStyleRecordForAdmin,
  type AuthoritativeDesignStyleRecordV1,
} from "../src/utils/designStyleAuthority.js";
import {
  parseDesignStyleCategoryRecord,
  planDesignStyleCategoryMigration,
  sortDesignStyleCategories,
} from "../src/utils/designStyleCategories.js";

const readOption = (argv: string[], name: string): string | undefined => {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const hasAdminCredentials = (): boolean =>
  Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      (process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
        process.env.FIREBASE_ADMIN_PRIVATE_KEY),
  );

interface LoadedSnapshot {
  readonly sourceMode: "admin_sdk" | "public_client_read";
  readonly rawStyles: Array<{ id: string; data: unknown }>;
  readonly categories: DesignStyleCategory[];
}

const loadCatalogueData = async ({
  projectId,
  forceAdminSdk,
}: {
  readonly projectId: string;
  readonly forceAdminSdk: boolean;
}): Promise<LoadedSnapshot> => {
  if (forceAdminSdk || hasAdminCredentials()) {
    const { db } = getProjectBoundAdminServices(projectId);
    const [stylesSnap, categoriesSnap] = await Promise.all([
      db.collection("styles").get(),
      db.collection("design_style_categories").get(),
    ]);
    const categories = sortDesignStyleCategories(
      categoriesSnap.docs
        .map((doc) => parseDesignStyleCategoryRecord(doc.id, doc.data()))
        .filter((cat): cat is DesignStyleCategory => cat !== null),
    );
    return {
      sourceMode: "admin_sdk",
      rawStyles: stylesSnap.docs.map((doc) => ({
        id: doc.id,
        data: doc.data(),
      })),
      categories,
    };
  }

  const app = initializeApp(committedStagingConfig);
  const db = clientGetFirestore(app, committedStagingConfig.firestoreDatabaseId);
  const [stylesSnap, categoriesSnap] = await Promise.all([
    clientGetDocs(clientCollection(db, "styles")),
    clientGetDocs(clientCollection(db, "design_style_categories")),
  ]);
  const categories = sortDesignStyleCategories(
    categoriesSnap.docs
      .map((doc) => parseDesignStyleCategoryRecord(doc.id, doc.data()))
      .filter((cat): cat is DesignStyleCategory => cat !== null),
  );
  return {
    sourceMode: "public_client_read",
    rawStyles: stylesSnap.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    })),
    categories,
  };
};

async function main(argv: string[]) {
  const apply = argv.includes("--apply");
  const projectId =
    readOption(argv, "project") || committedStagingConfig.projectId;
  if (apply) {
    if (!readOption(argv, "project")) {
      throw new Error(
        "--apply requires explicit --project=<projectId> and --confirm-project=<projectId>.",
      );
    }
    if (readOption(argv, "confirm-project") !== projectId) {
      throw new Error("--apply requires --confirm-project=<same projectId>.");
    }
    if (!hasAdminCredentials()) {
      throw new Error(
        "Admin SDK credentials (GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_ADMIN_CLIENT_EMAIL/FIREBASE_ADMIN_PRIVATE_KEY) are required for --apply.",
      );
    }
  }

  const snapshot = await loadCatalogueData({ projectId, forceAdminSdk: apply });
  const authoritativeRecords = new Map<string, AuthoritativeDesignStyleRecordV1>();
  const nonAuthoritativeIds: string[] = [];
  const projectedStyles = [];

  for (const raw of snapshot.rawStyles) {
    const parsed = parseAuthoritativeDesignStyleRecord(raw.id, raw.data);
    if (parsed.status !== "valid") {
      nonAuthoritativeIds.push(`${raw.id} (${parsed.reason})`);
      continue;
    }
    authoritativeRecords.set(raw.id, parsed.record);
    projectedStyles.push(projectDesignStyleRecordForAdmin(parsed.record));
  }

  const plan = planDesignStyleCategoryMigration({
    styles: projectedStyles,
    categories: snapshot.categories,
  });

  console.log("Design Style Category Migration");
  console.log(`Mode: ${apply ? "APPLY (LIVE WRITE)" : "DRY RUN (NO WRITES)"}`);
  console.log(`Project: ${projectId} | Source: ${snapshot.sourceMode}`);
  console.log(
    `Registry categories: ${plan.totalCategories} | Authoritative styles scanned: ${plan.totalStyles}`,
  );
  if (nonAuthoritativeIds.length > 0) {
    console.log(
      `Skipped non-authoritative/legacy styles (${nonAuthoritativeIds.length}): ${nonAuthoritativeIds.join(", ")}`,
    );
  }
  console.log(`Already aligned: ${plan.alreadyAlignedCount}`);
  console.log(`Matched styles ready to update: ${plan.updates.length}`);
  for (const update of plan.updates) {
    console.log(
      `  UPDATE ${update.styleId} (${update.styleName}): [${update.previousDesignCategories.join(", ")}] -> categoryIds=[${update.nextCategoryIds.join(", ")}], designCategories=[${update.nextDesignCategories.join(", ")}]`,
    );
  }

  if (plan.skippedStyles.length > 0) {
    console.log(
      `Skipped styles requiring manual review (${plan.skippedStyles.length}):`,
    );
    for (const skipped of plan.skippedStyles) {
      console.log(
        `  SKIP ${skipped.styleId} (${skipped.styleName}) [${skipped.reason}] matched=[${skipped.matchedCategoryIds.join(", ")}] unmatched=[${skipped.unmatchedStrings.join(", ")}]`,
      );
    }
  }

  if (plan.unmatchedStrings.length > 0) {
    console.log(
      `Unmatched category strings requiring manual Admin review (${plan.unmatchedStrings.length} — never auto-created):`,
    );
    for (const unmatched of plan.unmatchedStrings) {
      console.log(
        `  UNMATCHED "${unmatched.rawString}" -> normalized "${unmatched.normalizedString}" (styles: ${unmatched.styleIds.join(", ")})`,
      );
    }
  }

  if (!apply) {
    console.log(
      "Dry run complete. Re-run with --apply --project=<projectId> --confirm-project=<projectId> to commit matched updates.",
    );
    return;
  }

  if (plan.updates.length === 0) {
    console.log("No updates required.");
    return;
  }

  const { db } = getProjectBoundAdminServices(projectId);
  let committed = 0;
  for (let offset = 0; offset < plan.updates.length; offset += 250) {
    const batch = db.batch();
    for (const update of plan.updates.slice(offset, offset + 250)) {
      const currentRecord = authoritativeRecords.get(update.styleId);
      if (!currentRecord) continue;
      const projected = projectDesignStyleRecordForAdmin(currentRecord);
      const nextRecord = prepareAuthoritativeDesignStyleRecord({
        style: {
          ...projected,
          categoryIds: [...update.nextCategoryIds],
          designCategories: [...update.nextDesignCategories],
        },
        lifecycle: currentRecord.lifecycle,
        displayOrder: currentRecord.presentation.displayOrder,
        referenceComposition: currentRecord.referenceComposition,
        currentRecord,
        categories: snapshot.categories,
      });
      if (nextRecord.eligibilityRevision !== currentRecord.eligibilityRevision) {
        throw new Error(
          `Safety abort: eligibilityRevision changed unexpectedly for ${update.styleId}`,
        );
      }
      batch.set(db.collection("styles").doc(update.styleId), nextRecord);
      committed += 1;
    }
    await batch.commit();
  }
  console.log(`Committed ${committed} Design Style category updates.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
