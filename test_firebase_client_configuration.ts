import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import committedProductionConfig from "./firebase-applet-config.json" with {
  type: "json",
};
import {
  APPROVED_NON_PRODUCTION_APP_ENV,
  DEFAULT_FIRESTORE_DATABASE_LABEL,
  FirebaseClientConfigurationError,
  emitFirebaseClientConfigurationDiagnostic,
  formatFirebaseClientConfigurationDiagnostic,
  initializeResolvedFirebaseClient,
  normalizeCommittedProductionIdentifiers,
  readFirebaseClientEnvironmentVariables,
  resolveExplicitStagingFirebaseClientConfiguration,
  resolveFirebaseClientConfiguration,
  resolveFirebaseRuntimeMode,
  type FirebaseClientEnvironmentVariables,
} from "./src/utils/firebaseClientConfiguration";
import {
  createTestStorageFirebaseApp,
  isTestStorageExecutedDirectly,
  resolveTestStorageFirebaseClientConfiguration,
} from "./test-storage";

const productionIdentifiers = normalizeCommittedProductionIdentifiers(
  committedProductionConfig,
);

const STAGING_PROJECT_ID = "odogwu-heritage-staging";
const STAGING_APP_ID = "1:123456789012:web:stagingappid0001";
const STAGING_DATABASE_ID = "staging-custom-details";
const STAGING_API_KEY = "staging-web-api-key-not-for-production";
const STAGING_AUTH_DOMAIN = "auth.staging.example.com";
const STAGING_STORAGE_BUCKET = "staging-custom-bucket.appspot.com";
const STAGING_MESSAGING_SENDER_ID = "123456789012";
const STAGING_MEASUREMENT_ID = "G-STAGINGONLY001";
const FIXTURE_PRODUCTION_MEASUREMENT_ID = "G-PRODUCTIONONLY1";

const stagingVariables = (
  overrides: Partial<FirebaseClientEnvironmentVariables> = {},
): FirebaseClientEnvironmentVariables => ({
  VITE_APP_ENV: APPROVED_NON_PRODUCTION_APP_ENV,
  VITE_FIREBASE_API_KEY: STAGING_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: STAGING_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: STAGING_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: STAGING_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: STAGING_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: STAGING_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID: STAGING_MEASUREMENT_ID,
  VITE_FIRESTORE_DATABASE_ID: STAGING_DATABASE_ID,
  ...overrides,
});

const productionIdentifierValues = [
  productionIdentifiers.apiKey,
  productionIdentifiers.authDomain,
  productionIdentifiers.projectId,
  productionIdentifiers.storageBucket,
  productionIdentifiers.messagingSenderId,
  productionIdentifiers.appId,
  productionIdentifiers.measurementId,
  productionIdentifiers.firestoreDatabaseId,
  FIXTURE_PRODUCTION_MEASUREMENT_ID,
].filter((value) => value !== "");

const assertErrorOmitsIdentifierValues = (message: string) => {
  for (const value of productionIdentifierValues) {
    assert.equal(
      message.includes(value),
      false,
      "configuration errors must not include production identifier values",
    );
  }
  assert.equal(message.includes(STAGING_API_KEY), false);
};

const expectConfigurationError = (
  variables: FirebaseClientEnvironmentVariables,
  pattern: RegExp,
  committedConfig = committedProductionConfig,
) => {
  assert.throws(
    () =>
      resolveFirebaseClientConfiguration({
        runtimeMode: "development",
        variables,
        committedProductionConfig: committedConfig,
      }),
    (error: unknown) => {
      assert.ok(error instanceof FirebaseClientConfigurationError);
      assert.match(error.message, /ignored `\.env\.local`/);
      assert.match(error.message, pattern);
      assertErrorOmitsIdentifierValues(error.message);
      return true;
    },
  );
};

const expectRuntimeModeError = (runtime: {
  DEV?: boolean;
  PROD?: boolean;
  MODE?: string;
}) => {
  assert.throws(
    () => resolveFirebaseRuntimeMode(runtime),
    (error: unknown) => {
      assert.ok(error instanceof FirebaseClientConfigurationError);
      assert.match(error.message, /unknown or contradictory/);
      return true;
    },
  );
};

const simulateClientBootstrap = (
  runtime: {
    DEV?: boolean;
    PROD?: boolean;
    MODE?: string;
  },
  initializerState: { invoked: boolean },
) => {
  const runtimeMode = resolveFirebaseRuntimeMode(runtime);
  const resolved = resolveFirebaseClientConfiguration({
    runtimeMode,
    variables: {},
    committedProductionConfig,
  });
  initializeResolvedFirebaseClient(resolved, {
    initializeApp: () => {
      initializerState.invoked = true;
      return { name: "boot" };
    },
    getFirestore: () => ({}),
    getAuth: () => ({}),
    getStorage: () => ({}),
  });
  return initializerState.invoked;
};

assert.equal(
  resolveFirebaseRuntimeMode({
    DEV: true,
    PROD: false,
    MODE: "development",
  }),
  "development",
);
assert.equal(
  resolveFirebaseRuntimeMode({
    DEV: false,
    PROD: true,
    MODE: "production",
  }),
  "production",
);
expectRuntimeModeError({});
expectRuntimeModeError({ DEV: false, PROD: false });
expectRuntimeModeError({ MODE: "staging" });
expectRuntimeModeError({ DEV: false, PROD: true, MODE: "staging" });
expectRuntimeModeError({ DEV: true, PROD: false, MODE: "production" });
expectRuntimeModeError({ DEV: false, PROD: true, MODE: "development" });
expectRuntimeModeError({ DEV: true, MODE: "development" });
expectRuntimeModeError({ DEV: true, PROD: false, MODE: "staging" });

const unknownRuntimeInitializer = { invoked: false };
assert.throws(
  () => simulateClientBootstrap({}, unknownRuntimeInitializer),
  FirebaseClientConfigurationError,
);
assert.equal(unknownRuntimeInitializer.invoked, false);

const stagingBuildInitializer = { invoked: false };
assert.throws(
  () =>
    simulateClientBootstrap(
      { DEV: false, PROD: true, MODE: "staging" },
      stagingBuildInitializer,
    ),
  FirebaseClientConfigurationError,
);
assert.equal(stagingBuildInitializer.invoked, false);

const contradictoryInitializer = { invoked: false };
assert.throws(
  () =>
    simulateClientBootstrap(
      { DEV: true, PROD: false, MODE: "production" },
      contradictoryInitializer,
    ),
  FirebaseClientConfigurationError,
);
assert.equal(contradictoryInitializer.invoked, false);

const productionBuildInitializer = { invoked: false };
assert.equal(
  simulateClientBootstrap(
    { DEV: false, PROD: true, MODE: "production" },
    productionBuildInitializer,
  ),
  true,
);
assert.equal(productionBuildInitializer.invoked, true);

expectConfigurationError(
  {},
  /Offending variables: VITE_APP_ENV, VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID/,
);

expectConfigurationError(
  stagingVariables({ VITE_FIREBASE_PROJECT_ID: undefined }),
  /VITE_FIREBASE_PROJECT_ID/,
);

expectConfigurationError(
  stagingVariables({
    VITE_FIREBASE_API_KEY: "   ",
    VITE_FIREBASE_AUTH_DOMAIN: "",
  }),
  /VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN/,
);

expectConfigurationError(
  stagingVariables({ VITE_APP_ENV: "production" }),
  /VITE_APP_ENV must be staging/,
);

expectConfigurationError(
  stagingVariables({
    VITE_FIREBASE_API_KEY: `  ${productionIdentifiers.apiKey}  `,
  }),
  /Offending variables: VITE_FIREBASE_API_KEY/,
);

expectConfigurationError(
  stagingVariables({
    VITE_FIREBASE_AUTH_DOMAIN: productionIdentifiers.authDomain,
  }),
  /Offending variables: VITE_FIREBASE_AUTH_DOMAIN/,
);

expectConfigurationError(
  stagingVariables({
    VITE_FIREBASE_STORAGE_BUCKET: productionIdentifiers.storageBucket,
  }),
  /Offending variables: VITE_FIREBASE_STORAGE_BUCKET/,
);

expectConfigurationError(
  stagingVariables({
    VITE_FIREBASE_MESSAGING_SENDER_ID: productionIdentifiers.messagingSenderId,
  }),
  /Offending variables: VITE_FIREBASE_MESSAGING_SENDER_ID/,
);

expectConfigurationError(
  stagingVariables({
    VITE_FIREBASE_APP_ID: productionIdentifiers.appId,
  }),
  /Offending variables: VITE_FIREBASE_APP_ID/,
);

expectConfigurationError(
  stagingVariables({
    VITE_FIRESTORE_DATABASE_ID: productionIdentifiers.firestoreDatabaseId,
  }),
  /Offending variables: VITE_FIRESTORE_DATABASE_ID/,
);

expectConfigurationError(
  stagingVariables({
    VITE_FIREBASE_PROJECT_ID: productionIdentifiers.projectId,
  }),
  /Offending variables: VITE_FIREBASE_PROJECT_ID/,
);

const committedProductionWithMeasurementId = {
  ...committedProductionConfig,
  measurementId: FIXTURE_PRODUCTION_MEASUREMENT_ID,
};
expectConfigurationError(
  stagingVariables({
    VITE_FIREBASE_MEASUREMENT_ID: ` ${FIXTURE_PRODUCTION_MEASUREMENT_ID} `,
  }),
  /Offending variables: VITE_FIREBASE_MEASUREMENT_ID/,
  committedProductionWithMeasurementId,
);

const blankProductionMeasurementStillAllowsStagingMeasurement =
  resolveFirebaseClientConfiguration({
    runtimeMode: "development",
    variables: stagingVariables(),
    committedProductionConfig,
  });
assert.equal(
  blankProductionMeasurementStillAllowsStagingMeasurement.firebaseOptions
    .measurementId,
  STAGING_MEASUREMENT_ID,
);

const stagingNamed = resolveFirebaseClientConfiguration({
  runtimeMode: "development",
  variables: stagingVariables(),
  committedProductionConfig,
});
assert.equal(stagingNamed.applicationEnvironment, "staging");
assert.equal(stagingNamed.configurationSource, "explicit_environment");
assert.equal(stagingNamed.projectId, STAGING_PROJECT_ID);
assert.equal(stagingNamed.firebaseOptions.projectId, STAGING_PROJECT_ID);
assert.equal(stagingNamed.firebaseOptions.authDomain, STAGING_AUTH_DOMAIN);
assert.equal(
  stagingNamed.firebaseOptions.storageBucket,
  STAGING_STORAGE_BUCKET,
);
assert.equal(stagingNamed.firestoreDatabaseId, STAGING_DATABASE_ID);
assert.equal(stagingNamed.diagnostic.projectId, STAGING_PROJECT_ID);
assert.equal(stagingNamed.diagnostic.firestoreDatabaseId, STAGING_DATABASE_ID);
assert.equal(stagingNamed.diagnostic.configurationSource, "explicit_environment");
assert.equal(
  "apiKey" in stagingNamed.diagnostic,
  false,
  "diagnostic must not include the API key",
);

const stagingDefaultDatabase = resolveFirebaseClientConfiguration({
  runtimeMode: "development",
  variables: stagingVariables({ VITE_FIRESTORE_DATABASE_ID: undefined }),
  committedProductionConfig,
});
assert.equal(stagingDefaultDatabase.firestoreDatabaseId, null);
assert.equal(
  stagingDefaultDatabase.diagnostic.firestoreDatabaseId,
  DEFAULT_FIRESTORE_DATABASE_LABEL,
);

const stagingExplicitDefault = resolveFirebaseClientConfiguration({
  runtimeMode: "development",
  variables: stagingVariables({
    VITE_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_LABEL,
  }),
  committedProductionConfig,
});
assert.equal(stagingExplicitDefault.firestoreDatabaseId, null);

const productionResolved = resolveFirebaseClientConfiguration({
  runtimeMode: "production",
  variables: {},
  committedProductionConfig,
});
assert.equal(productionResolved.applicationEnvironment, "production");
assert.equal(productionResolved.configurationSource, "committed_production");
assert.equal(productionResolved.projectId, productionIdentifiers.projectId);
assert.equal(
  productionResolved.firestoreDatabaseId,
  productionIdentifiers.firestoreDatabaseId,
);
assert.equal(
  productionResolved.firebaseOptions.appId,
  productionIdentifiers.appId,
);
assert.equal(
  productionResolved.firebaseOptions.authDomain,
  productionIdentifiers.authDomain,
);
assert.equal(
  productionResolved.firebaseOptions.apiKey,
  productionIdentifiers.apiKey,
);
assert.equal(
  productionResolved.firebaseOptions.storageBucket,
  productionIdentifiers.storageBucket,
);
assert.equal(
  productionResolved.firebaseOptions.messagingSenderId,
  productionIdentifiers.messagingSenderId,
);

const productionIgnoresStagingVariables = resolveFirebaseClientConfiguration({
  runtimeMode: "production",
  variables: stagingVariables(),
  committedProductionConfig,
});
assert.equal(
  productionIgnoresStagingVariables.projectId,
  productionIdentifiers.projectId,
  "production builds keep the committed Firebase project",
);
assert.equal(
  productionIgnoresStagingVariables.configurationSource,
  "committed_production",
);

const mixedEnvironment = readFirebaseClientEnvironmentVariables({
  VITE_APP_ENV: "staging",
  VITE_FIREBASE_PROJECT_ID: STAGING_PROJECT_ID,
  VITE_FIREBASE_API_KEY: STAGING_API_KEY,
  FIREBASE_ADMIN_PROJECT_ID: productionIdentifiers.projectId,
  FIREBASE_ADMIN_CLIENT_EMAIL: "admin@example.com",
  FIREBASE_ADMIN_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----",
  FIREBASE_SERVICE_ACCOUNT_KEY: "admin-json",
  STRIPE_SECRET_KEY: "sk_test_not_for_client",
  GEMINI_API_KEY: "gemini-secret",
  NODE_ENV: "development",
});
assert.deepEqual(Object.keys(mixedEnvironment).sort(), [
  "VITE_APP_ENV",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_MEASUREMENT_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIRESTORE_DATABASE_ID",
]);
assert.equal(mixedEnvironment.VITE_APP_ENV, "staging");
assert.equal(mixedEnvironment.VITE_FIREBASE_PROJECT_ID, STAGING_PROJECT_ID);
assert.equal(
  JSON.stringify(mixedEnvironment).includes("BEGIN PRIVATE KEY"),
  false,
);
assert.equal(JSON.stringify(mixedEnvironment).includes("sk_test_not_for_client"), false);
assert.equal(JSON.stringify(mixedEnvironment).includes("admin@example.com"), false);

const diagnosticText = formatFirebaseClientConfigurationDiagnostic(
  stagingNamed.diagnostic,
);
assert.match(diagnosticText, /applicationEnvironment=staging/);
assert.match(diagnosticText, new RegExp(`projectId=${STAGING_PROJECT_ID}`));
assert.match(diagnosticText, new RegExp(`firestoreDatabaseId=${STAGING_DATABASE_ID}`));
assert.match(diagnosticText, /configurationSource=explicit_environment/);
assert.equal(diagnosticText.includes(STAGING_API_KEY), false);
assert.equal(diagnosticText.includes("BEGIN PRIVATE KEY"), false);
assert.equal(diagnosticText.toLowerCase().includes("apikey"), false);

const logged: string[] = [];
emitFirebaseClientConfigurationDiagnostic(stagingNamed, "development", {
  info: (message: string) => {
    logged.push(message);
  },
});
assert.deepEqual(logged, [diagnosticText]);
logged.length = 0;
emitFirebaseClientConfigurationDiagnostic(productionResolved, "production", {
  info: (message: string) => {
    logged.push(message);
  },
});
assert.deepEqual(logged, [], "production must not emit the client diagnostic");

const resolverSource = readFileSync(
  "src/utils/firebaseClientConfiguration.ts",
  "utf8",
);
assert.equal(resolverSource.includes('from "firebase/app"'), false);
assert.equal(resolverSource.includes('from "firebase/firestore"'), false);
assert.equal(resolverSource.includes('from "firebase/auth"'), false);
assert.equal(resolverSource.includes('from "firebase/storage"'), false);
assert.equal(resolverSource.includes("getAnalytics"), false);
assert.equal(resolverSource.includes("process.env."), false);

let initializerInvoked = false;
const failingVariables: FirebaseClientEnvironmentVariables = {};
try {
  const resolved = resolveFirebaseClientConfiguration({
    runtimeMode: "development",
    variables: failingVariables,
    committedProductionConfig,
  });
  initializeResolvedFirebaseClient(resolved, {
    initializeApp: () => {
      initializerInvoked = true;
      return { name: "blocked" };
    },
    getFirestore: () => {
      initializerInvoked = true;
      return {};
    },
    getAuth: () => {
      initializerInvoked = true;
      return {};
    },
    getStorage: () => {
      initializerInvoked = true;
      return {};
    },
  });
  assert.fail("invalid development configuration must throw before initialization");
} catch (error) {
  assert.ok(error instanceof FirebaseClientConfigurationError);
}
assert.equal(initializerInvoked, false);

let namedDatabaseId: string | undefined;
const initialized = initializeResolvedFirebaseClient(stagingNamed, {
  initializeApp: (options) => {
    initializerInvoked = true;
    assert.equal(options.projectId, STAGING_PROJECT_ID);
    assert.equal(options.apiKey, STAGING_API_KEY);
    return { name: "staging-app" };
  },
  getFirestore: (_app, databaseId) => {
    namedDatabaseId = databaseId;
    return { databaseId };
  },
  getAuth: () => ({ kind: "auth" }),
  getStorage: () => ({ kind: "storage" }),
});
assert.equal(initializerInvoked, true);
assert.equal(namedDatabaseId, STAGING_DATABASE_ID);
assert.equal(initialized.app.name, "staging-app");

let defaultDatabaseCalledWithExtraId = false;
initializeResolvedFirebaseClient(stagingDefaultDatabase, {
  initializeApp: () => ({ name: "staging-default" }),
  getFirestore: (_app, databaseId) => {
    if (databaseId !== undefined) defaultDatabaseCalledWithExtraId = true;
    return { databaseId: databaseId ?? DEFAULT_FIRESTORE_DATABASE_LABEL };
  },
  getAuth: () => ({}),
  getStorage: () => ({}),
});
assert.equal(defaultDatabaseCalledWithExtraId, false);

const firebaseServiceSource = readFileSync("src/services/firebase.ts", "utf8");
const runtimeModeCallIndex = firebaseServiceSource.indexOf(
  "const runtimeMode = resolveFirebaseRuntimeMode(",
);
const resolveCallIndex = firebaseServiceSource.indexOf(
  "const resolvedFirebaseClientConfiguration = resolveFirebaseClientConfiguration(",
);
const initializeCallIndex = firebaseServiceSource.indexOf("initializeApp(");
assert.ok(runtimeModeCallIndex >= 0);
assert.ok(resolveCallIndex > runtimeModeCallIndex);
assert.ok(initializeCallIndex > resolveCallIndex);
assert.equal(firebaseServiceSource.includes("getAnalytics"), false);

const duplicateInitializerSource = readFileSync("src/firebase/config.ts", "utf8");
assert.equal(duplicateInitializerSource.includes("initializeApp("), false);

const testFileSource = readFileSync(
  "test_firebase_client_configuration.ts",
  "utf8",
);
assert.equal(
  /^import .+ from ["']\.\/src\/services\/firebase["']/m.test(testFileSource),
  false,
  "pure resolver tests must not import the live initializer",
);

const stagingEnvRecord = stagingVariables() as Record<string, unknown>;
const explicitStaging = resolveExplicitStagingFirebaseClientConfiguration({
  environment: stagingEnvRecord,
  committedProductionConfig,
});
assert.equal(explicitStaging.projectId, STAGING_PROJECT_ID);

const testStorageResolved =
  resolveTestStorageFirebaseClientConfiguration(stagingEnvRecord);
assert.equal(testStorageResolved.applicationEnvironment, "staging");
assert.equal(testStorageResolved.projectId, STAGING_PROJECT_ID);
assert.notEqual(testStorageResolved.projectId, productionIdentifiers.projectId);

assert.throws(
  () =>
    resolveTestStorageFirebaseClientConfiguration({
      ...stagingEnvRecord,
      VITE_FIREBASE_STORAGE_BUCKET: productionIdentifiers.storageBucket,
    }),
  FirebaseClientConfigurationError,
);

assert.throws(
  () =>
    resolveTestStorageFirebaseClientConfiguration({
      VITE_APP_ENV: "staging",
      VITE_FIREBASE_API_KEY: productionIdentifiers.apiKey,
      VITE_FIREBASE_AUTH_DOMAIN: productionIdentifiers.authDomain,
      VITE_FIREBASE_PROJECT_ID: productionIdentifiers.projectId,
      VITE_FIREBASE_STORAGE_BUCKET: productionIdentifiers.storageBucket,
      VITE_FIREBASE_MESSAGING_SENDER_ID: productionIdentifiers.messagingSenderId,
      VITE_FIREBASE_APP_ID: productionIdentifiers.appId,
      VITE_FIRESTORE_DATABASE_ID: productionIdentifiers.firestoreDatabaseId,
    }),
  (error: unknown) => {
    assert.ok(error instanceof FirebaseClientConfigurationError);
    assertErrorOmitsIdentifierValues(
      (error as FirebaseClientConfigurationError).message,
    );
    return true;
  },
);

let testStorageInitializerInvoked = false;
assert.throws(
  () =>
    createTestStorageFirebaseApp({}, () => {
      testStorageInitializerInvoked = true;
      return { name: "blocked-production" } as never;
    }),
  FirebaseClientConfigurationError,
);
assert.equal(testStorageInitializerInvoked, false);

let receivedTestStorageProjectId = "";
createTestStorageFirebaseApp(stagingEnvRecord, (options) => {
  testStorageInitializerInvoked = true;
  receivedTestStorageProjectId = options.projectId;
  assert.notEqual(options.projectId, productionIdentifiers.projectId);
  assert.notEqual(options.apiKey, productionIdentifiers.apiKey);
  assert.notEqual(options.authDomain, productionIdentifiers.authDomain);
  assert.notEqual(options.storageBucket, productionIdentifiers.storageBucket);
  assert.notEqual(options.appId, productionIdentifiers.appId);
  return { name: "staging-storage" } as never;
});
assert.equal(testStorageInitializerInvoked, true);
assert.equal(receivedTestStorageProjectId, STAGING_PROJECT_ID);

assert.equal(
  isTestStorageExecutedDirectly("file:///tmp/test-storage.ts", undefined),
  false,
);
assert.equal(
  isTestStorageExecutedDirectly(
    "file:///tmp/test-storage.ts",
    "/tmp/test_firebase_client_configuration.ts",
  ),
  false,
);

const testStorageSource = readFileSync("test-storage.ts", "utf8");
assert.match(
  testStorageSource,
  /resolveExplicitStagingFirebaseClientConfiguration/,
);
assert.equal(testStorageSource.includes("initializeApp(firebaseConfig)"), false);
assert.equal(
  testStorageSource.includes("initializeApp(committedProductionConfig)"),
  false,
);
assert.equal(testStorageSource.includes("ALLOW_PRODUCTION"), false);
assert.match(testStorageSource, /initialize\(resolved\.firebaseOptions\)/);
assert.match(testStorageSource, /initializeApp\(resolved\.firebaseOptions\)/);
assert.match(testStorageSource, /isTestStorageExecutedDirectly/);

console.log("PASS: fail-closed Firebase client configuration");
