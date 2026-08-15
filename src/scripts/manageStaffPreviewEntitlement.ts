import "dotenv/config";
import { pathToFileURL } from "node:url";
import { getProjectBoundAdminServices } from "../server/firebaseAdmin.js";
import {
  StaffPreviewEntitlementError,
  createFirebaseStaffPreviewEntitlementService,
  type StaffPreviewInspection,
  type StaffPreviewMutationOutcome,
} from "../server/staffPreviewEntitlement.js";

type Command = "grant" | "revoke" | "inspect" | "reconcile";
type MutationCommand = Exclude<Command, "inspect">;

interface ParsedArguments {
  command: Command;
  projectId: string;
  uid: string;
  confirmationSucceeded: boolean;
}

interface StaffPreviewCliService {
  grant(uid: string): Promise<StaffPreviewMutationOutcome>;
  revoke(uid: string): Promise<StaffPreviewMutationOutcome>;
  inspect(uid: string): Promise<StaffPreviewInspection>;
  reconcile(uid: string): Promise<StaffPreviewMutationOutcome>;
}

interface StaffPreviewCliDependencies {
  getProjectServices: typeof getProjectBoundAdminServices;
  createService: (services: {
    auth: ReturnType<typeof getProjectBoundAdminServices>["auth"];
    db: ReturnType<typeof getProjectBoundAdminServices>["db"];
  }) => StaffPreviewCliService;
  log: (message: string) => void;
}

export class StaffPreviewCliArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffPreviewCliArgumentError";
  }
}

export const staffPreviewEntitlementUsage = [
  "Usage:",
  "  npm run staff-preview:entitlement -- inspect --project=<projectId> --uid=<firebaseUid>",
  "  npm run staff-preview:entitlement -- grant --project=<projectId> --uid=<firebaseUid> --confirm-project=<projectId> --confirm-uid=<firebaseUid>",
  "  npm run staff-preview:entitlement -- revoke --project=<projectId> --uid=<firebaseUid> --confirm-project=<projectId> --confirm-uid=<firebaseUid>",
  "  npm run staff-preview:entitlement -- reconcile --project=<projectId> --uid=<firebaseUid> --confirm-project=<projectId> --confirm-uid=<firebaseUid>",
  "",
  "Obtain the Firebase UID before running this command. Email addresses and positional identifiers are rejected.",
].join("\n");

const commandValues: Command[] = ["grant", "revoke", "inspect", "reconcile"];
const optionNames = new Set([
  "project",
  "uid",
  "confirm-project",
  "confirm-uid",
]);

const requireProjectId = (value: string | undefined): string => {
  if (!value) {
    throw new StaffPreviewCliArgumentError("The explicit --project flag is required.");
  }
  if (
    value !== value.trim() ||
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value)
  ) {
    throw new StaffPreviewCliArgumentError("The --project value is invalid.");
  }
  return value;
};

const requireFirebaseUid = (value: string | undefined): string => {
  if (!value) {
    throw new StaffPreviewCliArgumentError(
      "The explicit --uid flag is required. Obtain the Firebase UID first.",
    );
  }
  if (
    value !== value.trim() ||
    value.length > 128 ||
    value.includes("@") ||
    value.includes("/") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new StaffPreviewCliArgumentError(
      "The --uid value must be an exact Firebase UID, not an email address.",
    );
  }
  return value;
};

export const parseStaffPreviewEntitlementArguments = (
  argv: string[],
): ParsedArguments => {
  const [rawCommand, ...rawOptions] = argv;
  if (!commandValues.includes(rawCommand as Command)) {
    throw new StaffPreviewCliArgumentError("A valid command is required.");
  }
  const command = rawCommand as Command;
  const options = new Map<string, string>();
  for (const option of rawOptions) {
    const match = /^--([a-z-]+)=(.*)$/.exec(option);
    if (!match || !optionNames.has(match[1])) {
      throw new StaffPreviewCliArgumentError(
        `Unknown or positional argument: ${option}`,
      );
    }
    if (options.has(match[1])) {
      throw new StaffPreviewCliArgumentError(`Duplicate flag: --${match[1]}`);
    }
    options.set(match[1], match[2]);
  }

  const projectId = requireProjectId(options.get("project"));
  const uid = requireFirebaseUid(options.get("uid"));
  if (command === "inspect") {
    if (options.has("confirm-project") || options.has("confirm-uid")) {
      throw new StaffPreviewCliArgumentError(
        "The read-only inspect command does not accept confirmation flags.",
      );
    }
    return { command, projectId, uid, confirmationSucceeded: false };
  }

  if (options.get("confirm-project") !== projectId) {
    throw new StaffPreviewCliArgumentError(
      `Refusing ${command}: --confirm-project must exactly match --project.`,
    );
  }
  if (options.get("confirm-uid") !== uid) {
    throw new StaffPreviewCliArgumentError(
      `Refusing ${command}: --confirm-uid must exactly match --uid.`,
    );
  }
  return { command, projectId, uid, confirmationSucceeded: true };
};

const printMutation = (
  result: StaffPreviewMutationOutcome,
  log: (message: string) => void,
) => {
  log(
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
  return result.status === "complete" ? 0 : 1;
};

export const executeStaffPreviewEntitlementCli = async (
  argv: string[],
  dependencies: StaffPreviewCliDependencies = {
    getProjectServices: getProjectBoundAdminServices,
    createService: createFirebaseStaffPreviewEntitlementService,
    log: console.log,
  },
): Promise<number> => {
  const args = parseStaffPreviewEntitlementArguments(argv);
  dependencies.log(
    JSON.stringify(
      {
        intendedAction: args.command,
        firebaseProjectId: args.projectId,
        targetUid: args.uid,
        confirmationSucceeded: args.confirmationSucceeded,
      },
      null,
      2,
    ),
  );

  const services = dependencies.getProjectServices(args.projectId);
  if (services.projectId !== args.projectId) {
    throw new Error(
      "The initialized Firebase Admin project does not match --project.",
    );
  }
  const service = dependencies.createService(services);

  if (args.command === "inspect") {
    const result = await service.inspect(args.uid);
    dependencies.log(
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
    return 0;
  }

  return printMutation(
    await service[args.command as MutationCommand](args.uid),
    dependencies.log,
  );
};

const main = async () => {
  try {
    process.exitCode = await executeStaffPreviewEntitlementCli(
      process.argv.slice(2),
    );
  } catch (error: unknown) {
    if (error instanceof StaffPreviewCliArgumentError) {
      console.error(error.message);
      console.error(staffPreviewEntitlementUsage);
      process.exitCode = 2;
    } else if (error instanceof StaffPreviewEntitlementError) {
      console.error(`${error.code}: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.error("Staff preview entitlement operation failed.");
      process.exitCode = 1;
    }
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
