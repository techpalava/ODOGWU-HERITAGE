import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import healthHandler from "./api/health.js";
import bootstrapHandler from "./api/auth/bootstrap.js";
import pinLoginHandler from "./api/auth/pin-login.js";
import pinRegisterHandler from "./api/auth/pin-register.js";
import uploadedDesignTransferHandler from "./api/orders/transfer-uploaded-design.js";
import uploadedDesignOwnershipClaimHandler from "./api/orders/create-uploaded-design-ownership-claim.js";
import futureOrderV2PersistenceHandler from "./api/orders/persist-future-order-v2.js";
import uploadedDesignDraftTransferHandler from "./api/design-studio/transfer-uploaded-design-draft.js";
import type {
  HttpRequest,
  HttpResponse,
} from "./src/server/httpTypes.js";

type ResponseState = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

function createResponse() {
  const state: ResponseState = {
    status: 200,
    headers: {},
    body: undefined,
  };

  const response: HttpResponse = {
    status(code) {
      state.status = code;
      return response;
    },
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value;
      return response;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };

  return { response, state };
}

function request(
  method: string,
  options: Partial<HttpRequest> = {},
): HttpRequest {
  return {
    method,
    headers: {},
    ...options,
  };
}

function assertVercelRuntimeImports(entryFiles: string[]) {
  const visited = new Set<string>();

  function visit(filePath: string) {
    const absolutePath = resolve(filePath);
    if (visited.has(absolutePath)) return;
    visited.add(absolutePath);

    const sourceText = readFileSync(absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(
      absolutePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    for (const statement of sourceFile.statements) {
      const moduleSpecifier =
        ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)
          ? statement.moduleSpecifier
          : undefined;
      if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
        continue;
      }

      const specifier = moduleSpecifier.text;
      if (!specifier.startsWith(".")) continue;

      assert.match(
        specifier,
        /\.(?:js|json)$/,
        `${absolutePath} must use an explicit runtime extension: ${specifier}`,
      );

      if (!specifier.endsWith(".js")) continue;
      const dependencyPath = resolve(
        dirname(absolutePath),
        specifier.replace(/\.js$/, ".ts"),
      );
      if (existsSync(dependencyPath)) visit(dependencyPath);
    }
  }

  entryFiles.forEach(visit);
}

async function run() {
  assertVercelRuntimeImports([
    "./api/health.ts",
    "./api/auth/bootstrap.ts",
    "./api/auth/pin-login.ts",
    "./api/auth/pin-register.ts",
    "./api/orders/transfer-uploaded-design.ts",
    "./api/orders/create-uploaded-design-ownership-claim.ts",
    "./api/design-studio/transfer-uploaded-design-draft.ts",
  ]);

  assert.equal(typeof healthHandler, "function");
  assert.equal(typeof bootstrapHandler, "function");
  assert.equal(typeof pinLoginHandler, "function");
  assert.equal(typeof pinRegisterHandler, "function");
  assert.equal(typeof uploadedDesignTransferHandler, "function");
  assert.equal(typeof uploadedDesignOwnershipClaimHandler, "function");
  assert.equal(typeof futureOrderV2PersistenceHandler, "function");
  assert.equal(typeof uploadedDesignDraftTransferHandler, "function");

  const health = createResponse();
  await healthHandler(request("GET"), health.response);
  assert.equal(health.state.status, 200);
  assert.deepEqual(health.state.body, { status: "ok" });
  assert.equal(health.state.headers["cache-control"], "no-store");

  const bootstrap = createResponse();
  await bootstrapHandler(request("POST"), bootstrap.response);
  assert.equal(bootstrap.state.status, 401);
  assert.deepEqual(bootstrap.state.body, {
    error: "Firebase login is required.",
  });

  const login = createResponse();
  await pinLoginHandler(
    request("POST", { body: {} }),
    login.response,
  );
  assert.equal(login.state.status, 400);
  assert.deepEqual(login.state.body, {
    error: "Identifier and PIN are required.",
  });

  const register = createResponse();
  await pinRegisterHandler(request("GET"), register.response);
  assert.equal(register.state.status, 405);
  assert.equal(register.state.headers.allow, "POST");
  assert.deepEqual(register.state.body, {
    error: "Method not allowed.",
  });

  const transfer = createResponse();
  await uploadedDesignTransferHandler(
    request("POST", { body: {} }),
    transfer.response,
  );
  assert.equal(transfer.state.status, 401);
  assert.deepEqual(transfer.state.body, {
    error: "Firebase authentication is required.",
    code: "AUTH_FAILED",
  });

  const ownershipClaim = createResponse();
  await uploadedDesignOwnershipClaimHandler(
    request("POST", { body: {} }),
    ownershipClaim.response,
  );
  assert.equal(ownershipClaim.state.status, 401);
  assert.deepEqual(ownershipClaim.state.body, {
    error: "Firebase authentication is required.",
    code: "CLAIM_AUTH_REQUIRED",
  });

  const futureOrderPersistence = createResponse();
  await futureOrderV2PersistenceHandler(
    request("POST", { body: {} }),
    futureOrderPersistence.response,
  );
  assert.equal(futureOrderPersistence.state.status, 401);
  assert.deepEqual(futureOrderPersistence.state.body, {
    error: "Firebase authentication is required.",
    code: "AUTH_REQUIRED",
  });

  const draftTransfer = createResponse();
  await uploadedDesignDraftTransferHandler(
    request("POST", { body: {} }),
    draftTransfer.response,
  );
  assert.equal(draftTransfer.state.status, 401);
  assert.deepEqual(draftTransfer.state.body, {
    error: "Firebase authentication is required.",
    code: "AUTH_FAILED",
  });

  console.log(
    "PASS: Vercel health and authentication route contracts",
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
