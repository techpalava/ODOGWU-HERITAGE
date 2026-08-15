import "dotenv/config";
import { getAdminServices } from "../server/firebaseAdmin.js";
import {
  StaffPreviewEntitlementError,
  createFirebaseStaffPreviewEntitlementService,
} from "../server/staffPreviewEntitlement.js";

type Command = "grant" | "revoke" | "inspect" | "reconcile";

const usage = () => {
  console.error(
    [
      "Usage:",
      "  npm run staff-preview:entitlement -- inspect <firebaseUid>",
      "  npm run staff-preview:entitlement -- grant <firebaseUid> --confirm=<firebaseUid>",
      "  npm run staff-preview:entitlement -- revoke <firebaseUid> --confirm=<firebaseUid>",
      "  npm run staff-preview:entitlement -- reconcile <firebaseUid> --confirm=<firebaseUid>",
      "",
      "The command requires existing Firebase Admin credentials. UID is the only account selector.",
    ].join("\n"),
  );
};

const parseArguments = () => {
  const [rawCommand, rawUid, ...options] = process.argv.slice(2);
  const command = rawCommand as Command;
  if (
    !["grant", "revoke", "inspect", "reconcile"].includes(command) ||
    !rawUid
  ) {
    usage();
    process.exitCode = 2;
    return null;
  }
  const uid = rawUid.trim();
  const confirmation = options
    .find((option) => option.startsWith("--confirm="))
    ?.slice("--confirm=".length);
  if (command !== "inspect" && confirmation !== uid) {
    console.error(
      `Refusing ${command}: repeat the exact UID with --confirm=${uid}`,
    );
    process.exitCode = 2;
    return null;
  }
  return { command, uid };
};

const printMutation = (result: Awaited<ReturnType<ReturnType<
  typeof createFirebaseStaffPreviewEntitlementService
>["grant"]>>) => {
  console.log(
    JSON.stringify(
      {
        operation: result.operation,
        status: result.status,
        entitlementStatus: result.entitlement.status,
        entitlementRevision: result.entitlement.revision,
        claimSynchronized: result.claimSynchronized,
        refreshTokensRevoked: result.refreshTokensRevoked,
        tokenRefreshRequired:
          result.operation === "grant" && result.status === "complete",
        issues: result.issues,
      },
      null,
      2,
    ),
  );
  if (result.status !== "complete") process.exitCode = 1;
};

const main = async () => {
  const args = parseArguments();
  if (!args) return;
  const { auth, db } = getAdminServices();
  const service = createFirebaseStaffPreviewEntitlementService({ auth, db });

  if (args.command === "inspect") {
    const result = await service.inspect(args.uid);
    console.log(
      JSON.stringify(
        {
          uid: result.uid,
          entitlementStatus: result.entitlement?.status || "missing",
          entitlementRevision: result.entitlement?.revision || null,
          claimRevision: result.claim?.entitlementRevision || null,
          authorized: result.authorization.authorized,
          authorizationReason: result.authorization.reason,
        },
        null,
        2,
      ),
    );
    return;
  }

  printMutation(await service[args.command](args.uid));
};

void main().catch((error: unknown) => {
  if (error instanceof StaffPreviewEntitlementError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error("Staff preview entitlement operation failed.");
  }
  process.exitCode = 1;
});
