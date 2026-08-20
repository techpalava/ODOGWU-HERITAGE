import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import committedStagingConfig from "./firebase-applet-config.json" with {
  type: "json",
};
import {
  APPROVED_NON_PRODUCTION_APP_ENV,
  DEFAULT_FIRESTORE_DATABASE_LABEL,
  FIREBASE_PRODUCTION_BOUNDARY,
  FirebaseClientConfigurationError,
  emitFirebaseClientConfigurationDiagnostic,
  formatFirebaseClientConfigurationDiagnostic,
  initializeResolvedFirebaseClient,
  isFirebasePublicProductionSupported,
  normalizeCommittedStagingIdentifiers,
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

const committedIdentifiers = normalizeCommittedStagingIdentifiers(
  committedStagingConfig,
);

const ALTERNATE_PROJECT_ID = "odogwu-heritage-qa-alt";
const ALTERNATE_APP_ID = "1:123456789012:web:stagingappid0001";
const ALTERNATE_DATABASE_ID = "staging-custom-details";
const ALTERNATE_API_KEY = "staging-web-api-key-not-for-production";
const ALTERNATE_AUTH_DOMAIN = "auth.staging.example.com";
const ALTERNATE_STORAGE_BUCKET = "staging-custom-bucket.appspot.com";
const ALTERNATE_MESSAGING_SENDER_ID = "123456789012";
const ALTERNATE_MEASUREMENT_ID = "G-STAGINGONLY001";
const FIXTURE_STAGING_MEASUREMENT_ID = "G-STAGINGMEASURE1";

const committedStagingVariables = (
  overrides: Partial<FirebaseClientEnvironmentVariables> = {},
): FirebaseClientEnvironmentVariables => ({
  VITE_APP_ENV: APPROVED_NON_PRODUCTION_APP_ENV,
  VITE_FIREBASE_API_KEY: committedIdentifiers.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: committedIdentifiers.authDomain,
  VITE_FIREBASE_PROJECT_ID: committedIdentifiers.projectId,
  VITE_FIREBASE_STORAGE_BUCKET: committedIdentifiers.storageBucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: committedIdentifiers.messagingSenderId,
  VITE_FIREBASE_APP_ID: committedIdentifiers.appId,
  VITE_FIREBASE_MEASUREMENT_ID: committedIdentifiers.measurementId,
  VITE_FIRESTORE_DATABASE_ID: committedIdentifiers.firestoreDatabaseId,
  ...overrides,
});

const alternateStagingVariables = (
  overrides: Partial<FirebaseClientEnvironmentVariables> = {},
): FirebaseClientEnvironmentVariables => ({
  VITE_APP_ENV: APPROVED_NON_PRODUCTION_APP_ENV,
  VITE_FIREBASE_API_KEY: ALTERNATE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: ALTERNATE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: ALTERNATE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: ALTERNATE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: ALTERNATE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: ALTERNATE_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID: ALTERNATE_MEASUREMENT_ID,
  VITE_FIRESTORE_DATABASE_ID: ALTERNATE_DATABASE_ID,
  ...overrides,
});

const secretLikeValues = [
  committedIdentifiers.apiKey,
  ALTERNATE_API_KEY,
].filter((value) => value !== "");

const assertErrorOmitsSecretValues = (message: string) => {
  for (const value of secretLikeValues) {
    assert.equal(
      message.includes(value),
      false,
      "configuration errors must not include API key values",
    );
  }
};

const expectDevelopmentError = (
  variables: FirebaseClientEnvironmentVariables,
  pattern: RegExp,
  committedConfig = committedStagingConfig,
) => {
  assert.throws(
    () =>
      resolveFirebaseClientConfiguration({
        runtimeMode: "development",
        variables,
        committedStagingConfig: committedConfig,
      }),
    (error: unknown) => {
      assert.ok(error instanceof FirebaseClientConfigurationError);
      assert.match(error.message, /ignored `\.env\.local`/);
      assert.match(error.message, pattern);
      assertErrorOmitsSecretValues(error.message);
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
  variables: FirebaseClientEnvironmentVariables = {},
) => {
  const runtimeMode = resolveFirebaseRuntimeMode(runtime);
  const resolved = resolveFirebaseClientConfiguration({
    runtimeMode,
    variables,
    committedStagingConfig,
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
  return { invoked: initializerState.invoked, resolved };
};

assert.equal(FIREBASE_PRODUCTION_BOUNDARY.publicProductionReady, false);
assert.equal(FIREBASE_PRODUCTION_BOUNDARY.currentResourceEnvironment, "staging");
assert.equal(
  FIREBASE_PRODUCTION_BOUNDARY.committedConfigurationSource,
  "committed_staging",
);
assert.equal(isFirebasePublicProductionSupported(), false);

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
const productionBuild = simulateClientBootstrap(
  { DEV: false, PROD: true, MODE: "production" },
  productionBuildInitializer,
);
assert.equal(productionBuild.invoked, true);
assert.equal(productionBuild.resolved.applicationEnvironment, "staging");
assert.equal(productionBuild.resolved.configurationSource, "committed_staging");
assert.equal(productionBuild.resolved.projectId, committedIdentifiers.projectId);
assert.equal(
  productionBuild.resolved.firestoreDatabaseId,
  committedIdentifiers.firestoreDatabaseId,
);
assert.notEqual(productionBuild.resolved.applicationEnvironment, "production");

expectDevelopmentError(
  {},
  /Offending variables: VITE_APP_ENV, VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID/,
);

expectDevelopmentError(
  committedStagingVariables({ VITE_FIREBASE_PROJECT_ID: undefined }),
  /VITE_FIREBASE_PROJECT_ID/,
);

expectDevelopmentError(
  committedStagingVariables({
    VITE_FIREBASE_API_KEY: "   ",
    VITE_FIREBASE_AUTH_DOMAIN: "",
  }),
  /VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN/,
);

expectDevelopmentError(
  committedStagingVariables({ VITE_APP_ENV: "production" }),
  /VITE_APP_ENV must be staging/,
);

const currentStagingExplicit = resolveFirebaseClientConfiguration({
  runtimeMode: "development",
  variables: committedStagingVariables(),
  committedStagingConfig,
});
assert.equal(currentStagingExplicit.applicationEnvironment, "staging");
assert.equal(currentStagingExplicit.configurationSource, "explicit_environment");
assert.equal(currentStagingExplicit.projectId, committedIdentifiers.projectId);
assert.equal(
  currentStagingExplicit.firestoreDatabaseId,
  committedIdentifiers.firestoreDatabaseId,
);
assert.equal(
  currentStagingExplicit.firebaseOptions.storageBucket,
  committedIdentifiers.storageBucket,
);
assert.equal(
  "apiKey" in currentStagingExplicit.diagnostic,
  false,
  "diagnostic must not include the API key",
);

const currentStagingPaddedProjectId = resolveFirebaseClientConfiguration({
  runtimeMode: "development",
  variables: committedStagingVariables({
    VITE_FIREBASE_PROJECT_ID: `  ${committedIdentifiers.projectId}  `,
    VITE_FIREBASE_API_KEY: ` ${committedIdentifiers.apiKey} `,
  }),
  committedStagingConfig,
});
assert.equal(
  currentStagingPaddedProjectId.projectId,
  committedIdentifiers.projectId,
);

const currentStagingBlankDatabaseUsesNamed = resolveFirebaseClientConfiguration({
  runtimeMode: "development",
  variables: committedStagingVariables({
    VITE_FIRESTORE_DATABASE_ID: undefined,
  }),
  committedStagingConfig,
});
assert.equal(
  currentStagingBlankDatabaseUsesNamed.firestoreDatabaseId,
  committedIdentifiers.firestoreDatabaseId,
  "current staging project must keep the named database when the ID is omitted",
);

const currentStagingExplicitDefault = resolveFirebaseClientConfiguration({
  runtimeMode: "development",
  variables: committedStagingVariables({
    VITE_FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE_LABEL,
  }),
  committedStagingConfig,
});
assert.equal(currentStagingExplicitDefault.firestoreDatabaseId, null);

expectDevelopmentError(
  committedStagingVariables({
    VITE_FIREBASE_STORAGE_BUCKET: ALTERNATE_STORAGE_BUCKET,
  }),
  /Offending variables: VITE_FIREBASE_STORAGE_BUCKET/,
);

expectDevelopmentError(
  committedStagingVariables({
    VITE_FIREBASE_AUTH_DOMAIN: ALTERNATE_AUTH_DOMAIN,
  }),
  /Offending variables: VITE_FIREBASE_AUTH_DOMAIN/,
);

expectDevelopmentError(
  committedStagingVariables({
    VITE_FIREBASE_APP_ID: ALTERNATE_APP_ID,
  }),
  /Offending variables: VITE_FIREBASE_APP_ID/,
);

expectDevelopmentError(
  committedStagingVariables({
    VITE_FIREBASE_API_KEY: ALTERNATE_API_KEY,
  }),
  /Offending variables: VITE_FIREBASE_API_KEY/,
);

expectDevelopmentError(
  committedStagingVariables({
    VITE_FIREBASE_MESSAGING_SENDER_ID: ALTERNATE_MESSAGING_SENDER_ID,
  }),
  /Offending variables: VITE_FIREBASE_MESSAGING_SENDER_ID/,
);

expectDevelopmentError(
  committedStagingVariables({
    VITE_FIRESTORE_DATABASE_ID: ALTERNATE_DATABASE_ID,
  }),
  /Offending variables: VITE_FIRESTORE_DATABASE_ID/,
);

expectDevelopmentError(
  alternateStagingVariables({
    VITE_FIREBASE_STORAGE_BUCKET: committedIdentifiers.storageBucket,
  }),
  /Offending variables: VITE_FIREBASE_STORAGE_BUCKET/,
);

expectDevelopmentError(
  alternateStagingVariables({
    VITE_FIREBASE_AUTH_DOMAIN: committedIdentifiers.authDomain,
  }),
  /Offending variables: VITE_FIREBASE_AUTH_DOMAIN/,
);

expectDevelopmentError(
  alternateStagingVariables({
    VITE_FIREBASE_APP_ID: committedIdentifiers.appId,
  }),
  /Offending variables: VITE_FIREBASE_APP_ID/,
);

expectDevelopmentError(
  alternateStagingVariables({
    VITE_FIREBASE_API_KEY: committedIdentifiers.apiKey,
  }),
  /Offending variables: VITE_FIREBASE_API_KEY/,
);

expectDevelopmentError(
  alternateStagingVariables({
    VITE_FIRESTORE_DATABASE_ID: committedIdentifiers.firestoreDatabaseId,
  }),
  /Offending variables: VITE_FIRESTORE_DATABASE_ID/,
);

const committedStagingWithMeasurementId = {
  ...committedStagingConfig,
  measurementId: FIXTURE_STAGING_MEASUREMENT_ID,
};
expectDevelopmentError(
  committedStagingVariables({
    VITE_FIREBASE_MEASUREMENT_ID: "",
  }),
  /Offending variables: VITE_FIREBASE_MEASUREMENT_ID/,
  committedStagingWithMeasurementId,
);

const currentStagingMatchingMeasurement = resolveFirebaseClientConfiguration({
  runtimeMode: "development",
  variables: committedStagingVariables({
    VITE_FIREBASE_MEASUREMENT_ID: FIXTURE_STAGING_MEASUREMENT_ID,
  }),
  committedStagingConfig: committedStagingWithMeasurementId,
});
assert.equal(
  currentStagingMatchingMeasurement.firebaseOptions.measurementId,
  FIXTURE_STAGING_MEASUREMENT_ID,
);

const alternateStagingNamed = resolveFirebaseClientConfiguration({
  runtimeMode: "development",
  variables: alternateStagingVariables(),
  committedStagingConfig,
});
assert.equal(alternateStagingNamed.applicationEnvironment, "staging");
assert.equal(alternateStagingNamed.configurationSource, "explicit_environment");
assert.equal(alternateStagingNamed.projectId, ALTERNATE_PROJECT_ID);
assert.equal(alternateStagingNamed.firebaseOptions.authDomain, ALTERNATE_AUTH_DOMAIN);
assert.equal(
  alternateStagingNamed.firebaseOptions.storageBucket,
  ALTERNATE_STORAGE_BUCKET,
);
assert.equal(alternateStagingNamed.firestoreDatabaseId, ALTERNATE_DATABASE_ID);

const alternateStagingDefaultDatabase = resolveFirebaseClientConfiguration({
  runtimeMode: "development",
  variables: alternateStagingVariables({
    VITE_FIRESTORE_DATABASE_ID: undefined,
  }),
  committedStagingConfig,
});
assert.equal(alternateStagingDefaultDatabase.firestoreDatabaseId, null);
assert.equal(
  alternateStagingDefaultDatabase.diagnostic.firestoreDatabaseId,
  DEFAULT_FIRESTORE_DATABASE_LABEL,
);

const productionRuntimeResolved = resolveFirebaseClientConfiguration({
  runtimeMode: "production",
  variables: {},
  committedStagingConfig,
});
assert.equal(productionRuntimeResolved.applicationEnvironment, "staging");
assert.equal(productionRuntimeResolved.configurationSource, "committed_staging");
assert.equal(productionRuntimeResolved.projectId, committedIdentifiers.projectId);
assert.equal(
  productionRuntimeResolved.firestoreDatabaseId,
  committedIdentifiers.firestoreDatabaseId,
);
assert.equal(
  productionRuntimeResolved.firebaseOptions.appId,
  committedIdentifiers.appId,
);
assert.notEqual(productionRuntimeResolved.applicationEnvironment, "production");
assert.notEqual(
  productionRuntimeResolved.configurationSource,
  "committed_production",
);

const productionRuntimeIgnoresAlternateVariables =
  resolveFirebaseClientConfiguration({
    runtimeMode: "production",
    variables: alternateStagingVariables(),
    committedStagingConfig,
  });
assert.equal(
  productionRuntimeIgnoresAlternateVariables.projectId,
  committedIdentifiers.projectId,
  "Vite production runtime keeps the committed staging Firebase project",
);
assert.equal(
  productionRuntimeIgnoresAlternateVariables.firebaseOptions.apiKey,
  committedIdentifiers.apiKey,
);
assert.equal(
  productionRuntimeIgnoresAlternateVariables.configurationSource,
  "committed_staging",
);

const mixedEnvironment = readFirebaseClientEnvironmentVariables({
  VITE_APP_ENV: "staging",
  VITE_FIREBASE_PROJECT_ID: committedIdentifiers.projectId,
  VITE_FIREBASE_API_KEY: committedIdentifiers.apiKey,
  FIREBASE_ADMIN_PROJECT_ID: committedIdentifiers.projectId,
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
assert.equal(
  mixedEnvironment.VITE_FIREBASE_PROJECT_ID,
  committedIdentifiers.projectId,
);
assert.equal(
  JSON.stringify(mixedEnvironment).includes("BEGIN PRIVATE KEY"),
  false,
);
assert.equal(JSON.stringify(mixedEnvironment).includes("sk_test_not_for_client"), false);
assert.equal(JSON.stringify(mixedEnvironment).includes("admin@example.com"), false);

const diagnosticText = formatFirebaseClientConfigurationDiagnostic(
  currentStagingExplicit.diagnostic,
);
assert.match(diagnosticText, /applicationEnvironment=staging/);
assert.match(
  diagnosticText,
  new RegExp(`projectId=${committedIdentifiers.projectId}`),
);
assert.match(
  diagnosticText,
  new RegExp(`firestoreDatabaseId=${committedIdentifiers.firestoreDatabaseId}`),
);
assert.match(diagnosticText, /configurationSource=explicit_environment/);
assert.equal(diagnosticText.includes(committedIdentifiers.apiKey), false);
assert.equal(diagnosticText.includes("BEGIN PRIVATE KEY"), false);
assert.equal(diagnosticText.toLowerCase().includes("apikey"), false);

const logged: string[] = [];
emitFirebaseClientConfigurationDiagnostic(currentStagingExplicit, "development", {
  info: (message: string) => {
    logged.push(message);
  },
});
assert.deepEqual(logged, [diagnosticText]);
logged.length = 0;
emitFirebaseClientConfigurationDiagnostic(productionRuntimeResolved, "production", {
  info: (message: string) => {
    logged.push(message);
  },
});
assert.deepEqual(logged, [], "production runtime must not emit the client diagnostic");

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
assert.equal(resolverSource.includes("committedProductionConfig"), false);
assert.equal(resolverSource.includes("committed_production"), false);
assert.equal(resolverSource.includes("normalizeCommittedProductionIdentifiers"), false);

let initializerInvoked = false;
try {
  const resolved = resolveFirebaseClientConfiguration({
    runtimeMode: "development",
    variables: {},
    committedStagingConfig,
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
const initialized = initializeResolvedFirebaseClient(currentStagingExplicit, {
  initializeApp: (options) => {
    initializerInvoked = true;
    assert.equal(options.projectId, committedIdentifiers.projectId);
    assert.equal(options.apiKey, committedIdentifiers.apiKey);
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
assert.equal(namedDatabaseId, committedIdentifiers.firestoreDatabaseId);
assert.equal(initialized.app.name, "staging-app");

let defaultDatabaseCalledWithExtraId = false;
initializeResolvedFirebaseClient(currentStagingExplicitDefault, {
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
assert.equal(firebaseServiceSource.includes("committedProductionConfig"), false);
assert.match(firebaseServiceSource, /committedStagingConfig/);

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

const stagingEnvRecord = committedStagingVariables() as Record<string, unknown>;
const explicitStaging = resolveExplicitStagingFirebaseClientConfiguration({
  environment: stagingEnvRecord,
  committedStagingConfig,
});
assert.equal(explicitStaging.projectId, committedIdentifiers.projectId);
assert.equal(explicitStaging.applicationEnvironment, "staging");

const testStorageResolved =
  resolveTestStorageFirebaseClientConfiguration(stagingEnvRecord);
assert.equal(testStorageResolved.applicationEnvironment, "staging");
assert.equal(testStorageResolved.projectId, committedIdentifiers.projectId);
assert.equal(testStorageResolved.configurationSource, "explicit_environment");

assert.throws(
  () =>
    resolveTestStorageFirebaseClientConfiguration({
      ...stagingEnvRecord,
      VITE_FIREBASE_STORAGE_BUCKET: ALTERNATE_STORAGE_BUCKET,
    }),
  FirebaseClientConfigurationError,
);

assert.throws(
  () =>
    resolveTestStorageFirebaseClientConfiguration(
      alternateStagingVariables({
        VITE_FIREBASE_STORAGE_BUCKET: committedIdentifiers.storageBucket,
      }) as Record<string, unknown>,
    ),
  FirebaseClientConfigurationError,
);

const alternateTestStorage = resolveTestStorageFirebaseClientConfiguration(
  alternateStagingVariables() as Record<string, unknown>,
);
assert.equal(alternateTestStorage.projectId, ALTERNATE_PROJECT_ID);
assert.equal(alternateTestStorage.applicationEnvironment, "staging");

let testStorageInitializerInvoked = false;
assert.throws(
  () =>
    createTestStorageFirebaseApp({}, () => {
      testStorageInitializerInvoked = true;
      return { name: "blocked" } as never;
    }),
  FirebaseClientConfigurationError,
);
assert.equal(testStorageInitializerInvoked, false);

let receivedTestStorageProjectId = "";
createTestStorageFirebaseApp(stagingEnvRecord, (options) => {
  testStorageInitializerInvoked = true;
  receivedTestStorageProjectId = options.projectId;
  assert.equal(options.projectId, committedIdentifiers.projectId);
  return { name: "staging-storage" } as never;
});
assert.equal(testStorageInitializerInvoked, true);
assert.equal(receivedTestStorageProjectId, committedIdentifiers.projectId);

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
  testStorageSource.includes("initializeApp(committedStagingConfig)"),
  false,
);
assert.equal(
  testStorageSource.includes("initializeApp(committedProductionConfig)"),
  false,
);
assert.equal(testStorageSource.includes("ALLOW_PRODUCTION"), false);
assert.match(testStorageSource, /initialize\(resolved\.firebaseOptions\)/);
assert.match(testStorageSource, /initializeApp\(resolved\.firebaseOptions\)/);
assert.match(testStorageSource, /isTestStorageExecutedDirectly/);

const envExample = readFileSync(".env.example", "utf8");
assert.match(envExample, /PRE-LAUNCH STAGING/);
assert.match(envExample, /No production Firebase project exists yet/);
assert.match(envExample, /FIREBASE_ADMIN_PROJECT_ID="<STAGING_PROJECT_ID>"/);
assert.equal(envExample.includes(committedIdentifiers.apiKey), false);

console.log("PASS: staging-reclassified Firebase client configuration");
