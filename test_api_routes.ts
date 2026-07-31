import assert from "node:assert/strict";
import healthHandler from "./api/health";
import bootstrapHandler from "./api/auth/bootstrap";
import pinLoginHandler from "./api/auth/pin-login";
import pinRegisterHandler from "./api/auth/pin-register";
import type {
  HttpRequest,
  HttpResponse,
} from "./src/server/httpTypes";

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

async function run() {
  assert.equal(typeof healthHandler, "function");
  assert.equal(typeof bootstrapHandler, "function");
  assert.equal(typeof pinLoginHandler, "function");
  assert.equal(typeof pinRegisterHandler, "function");

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

  console.log(
    "PASS: Vercel health and authentication route contracts",
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
