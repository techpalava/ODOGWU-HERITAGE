export const APPROVED_NON_PRODUCTION_APP_ENV = "staging" as const;
export const DEFAULT_FIRESTORE_DATABASE_LABEL = "(default)";

/**
 * Pre-launch boundary. A dedicated production Firebase project does not exist
 * yet. The committed Web configuration is staging only and must not be treated
 * as production or publicly launched as production.
 */
export const FIREBASE_PRODUCTION_BOUNDARY = {
  publicProductionReady: false,
  currentResourceEnvironment: "staging",
  committedConfigurationSource: "committed_staging",
} as const;

export const FIREBASE_CLIENT_ENVIRONMENT_VARIABLES = [
  "VITE_APP_ENV",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_MEASUREMENT_ID",
  "VITE_FIRESTORE_DATABASE_ID",
] as const;

export const REQUIRED_STAGING_FIREBASE_CLIENT_VARIABLES = [
  "VITE_APP_ENV",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export type FirebaseRuntimeMode = "development" | "production";
export type FirebaseApplicationEnvironment = "staging" | "production";
export type FirebaseClientConfigurationSource =
  | "explicit_environment"
  | "committed_staging";

export interface FirebaseClientEnvironmentVariables {
  VITE_APP_ENV?: string;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
  VITE_FIRESTORE_DATABASE_ID?: string;
}

export interface CommittedStagingFirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  firestoreDatabaseId: string;
}

export interface CommittedStagingFirebaseIdentifiers {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
  firestoreDatabaseId: string;
}

export interface ResolveFirebaseClientConfigurationInput {
  runtimeMode: FirebaseRuntimeMode;
  variables: FirebaseClientEnvironmentVariables;
  committedStagingConfig: CommittedStagingFirebaseClientConfig;
}

export interface FirebaseClientFirebaseOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

export interface FirebaseClientConfigurationDiagnostic {
  applicationEnvironment: FirebaseApplicationEnvironment;
  projectId: string;
  firestoreDatabaseId: string;
  configurationSource: FirebaseClientConfigurationSource;
}

export interface ResolvedFirebaseClientConfiguration {
  applicationEnvironment: FirebaseApplicationEnvironment;
  configurationSource: FirebaseClientConfigurationSource;
  projectId: string;
  firebaseOptions: FirebaseClientFirebaseOptions;
  /**
   * Named Firestore database ID, or null to use the SDK default database.
   */
  firestoreDatabaseId: string | null;
  diagnostic: FirebaseClientConfigurationDiagnostic;
}

export class FirebaseClientConfigurationError extends Error {
  readonly code = "FIREBASE_CLIENT_CONFIGURATION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "FirebaseClientConfigurationError";
  }
}

const trimValue = (value: string | undefined): string =>
  typeof value === "string" ? value.trim() : "";

const readOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  return value;
};

export const readFirebaseClientEnvironmentVariables = (
  environment: Readonly<Record<string, unknown>>,
): FirebaseClientEnvironmentVariables => ({
  VITE_APP_ENV: readOptionalString(environment.VITE_APP_ENV),
  VITE_FIREBASE_API_KEY: readOptionalString(environment.VITE_FIREBASE_API_KEY),
  VITE_FIREBASE_AUTH_DOMAIN: readOptionalString(
    environment.VITE_FIREBASE_AUTH_DOMAIN,
  ),
  VITE_FIREBASE_PROJECT_ID: readOptionalString(
    environment.VITE_FIREBASE_PROJECT_ID,
  ),
  VITE_FIREBASE_STORAGE_BUCKET: readOptionalString(
    environment.VITE_FIREBASE_STORAGE_BUCKET,
  ),
  VITE_FIREBASE_MESSAGING_SENDER_ID: readOptionalString(
    environment.VITE_FIREBASE_MESSAGING_SENDER_ID,
  ),
  VITE_FIREBASE_APP_ID: readOptionalString(environment.VITE_FIREBASE_APP_ID),
  VITE_FIREBASE_MEASUREMENT_ID: readOptionalString(
    environment.VITE_FIREBASE_MEASUREMENT_ID,
  ),
  VITE_FIRESTORE_DATABASE_ID: readOptionalString(
    environment.VITE_FIRESTORE_DATABASE_ID,
  ),
});

export const normalizeCommittedStagingIdentifiers = (
  config: CommittedStagingFirebaseClientConfig,
): CommittedStagingFirebaseIdentifiers => ({
  apiKey: trimValue(config.apiKey),
  authDomain: trimValue(config.authDomain),
  projectId: trimValue(config.projectId),
  storageBucket: trimValue(config.storageBucket),
  messagingSenderId: trimValue(config.messagingSenderId),
  appId: trimValue(config.appId),
  measurementId: trimValue(config.measurementId),
  firestoreDatabaseId: trimValue(config.firestoreDatabaseId),
});

export const isFirebasePublicProductionSupported = (): boolean =>
  FIREBASE_PRODUCTION_BOUNDARY.publicProductionReady;

export const resolveFirebaseRuntimeMode = (environment: {
  DEV?: boolean;
  PROD?: boolean;
  MODE?: string;
}): FirebaseRuntimeMode => {
  const mode = trimValue(environment.MODE);
  const isExplicitDevelopment =
    environment.DEV === true &&
    environment.PROD === false &&
    mode === "development";
  const isExplicitProduction =
    environment.DEV === false &&
    environment.PROD === true &&
    mode === "production";

  if (isExplicitDevelopment) {
    return "development";
  }
  if (isExplicitProduction) {
    return "production";
  }

  throw new FirebaseClientConfigurationError(
    `Firebase client initialization is blocked because the runtime mode is unknown or contradictory (DEV=${String(environment.DEV)}, PROD=${String(environment.PROD)}, MODE=${mode || "(empty)"}). Use npm run dev with a staging .env.local, or a normal Vite production build. vite build --mode staging is not supported. A Vite production build currently still uses the committed staging Firebase project.`,
  );
};

const missingStagingVariableNames = (
  variables: FirebaseClientEnvironmentVariables,
): string[] =>
  REQUIRED_STAGING_FIREBASE_CLIENT_VARIABLES.filter(
    (name) => trimValue(variables[name]) === "",
  );

const createDevelopmentConfigurationError = (
  detail: string,
  missingNames: readonly string[] = [],
): FirebaseClientConfigurationError => {
  const missingList =
    missingNames.length > 0
      ? ` Offending variables: ${missingNames.join(", ")}.`
      : "";
  return new FirebaseClientConfigurationError(
    `Local Firebase initialization is blocked because no valid explicit staging configuration is present. Create an ignored \`.env.local\` using the Firebase web configuration from a single staging Web app. Set VITE_APP_ENV=${APPROVED_NON_PRODUCTION_APP_ENV} and copy every VITE_FIREBASE_* field from that same app.${missingList} ${detail}`,
  );
};

const collectSameProjectMismatches = ({
  apiKey,
  authDomain,
  storageBucket,
  messagingSenderId,
  appId,
  measurementId,
  committedIdentifiers,
}: {
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
  committedIdentifiers: CommittedStagingFirebaseIdentifiers;
}): string[] => {
  const mismatches: string[] = [];
  if (apiKey !== committedIdentifiers.apiKey) {
    mismatches.push("VITE_FIREBASE_API_KEY");
  }
  if (authDomain !== committedIdentifiers.authDomain) {
    mismatches.push("VITE_FIREBASE_AUTH_DOMAIN");
  }
  if (storageBucket !== committedIdentifiers.storageBucket) {
    mismatches.push("VITE_FIREBASE_STORAGE_BUCKET");
  }
  if (messagingSenderId !== committedIdentifiers.messagingSenderId) {
    mismatches.push("VITE_FIREBASE_MESSAGING_SENDER_ID");
  }
  if (appId !== committedIdentifiers.appId) {
    mismatches.push("VITE_FIREBASE_APP_ID");
  }
  if (measurementId !== committedIdentifiers.measurementId) {
    mismatches.push("VITE_FIREBASE_MEASUREMENT_ID");
  }
  return mismatches;
};

const collectCrossProjectCollisions = ({
  apiKey,
  authDomain,
  storageBucket,
  messagingSenderId,
  appId,
  measurementId,
  firestoreDatabaseId,
  committedIdentifiers,
}: {
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
  firestoreDatabaseId: string | null;
  committedIdentifiers: CommittedStagingFirebaseIdentifiers;
}): string[] => {
  const collisions: string[] = [];
  if (
    apiKey !== "" &&
    committedIdentifiers.apiKey !== "" &&
    apiKey === committedIdentifiers.apiKey
  ) {
    collisions.push("VITE_FIREBASE_API_KEY");
  }
  if (
    authDomain !== "" &&
    committedIdentifiers.authDomain !== "" &&
    authDomain === committedIdentifiers.authDomain
  ) {
    collisions.push("VITE_FIREBASE_AUTH_DOMAIN");
  }
  if (
    storageBucket !== "" &&
    committedIdentifiers.storageBucket !== "" &&
    storageBucket === committedIdentifiers.storageBucket
  ) {
    collisions.push("VITE_FIREBASE_STORAGE_BUCKET");
  }
  if (
    messagingSenderId !== "" &&
    committedIdentifiers.messagingSenderId !== "" &&
    messagingSenderId === committedIdentifiers.messagingSenderId
  ) {
    collisions.push("VITE_FIREBASE_MESSAGING_SENDER_ID");
  }
  if (
    appId !== "" &&
    committedIdentifiers.appId !== "" &&
    appId === committedIdentifiers.appId
  ) {
    collisions.push("VITE_FIREBASE_APP_ID");
  }
  if (
    committedIdentifiers.measurementId !== "" &&
    measurementId !== "" &&
    measurementId === committedIdentifiers.measurementId
  ) {
    collisions.push("VITE_FIREBASE_MEASUREMENT_ID");
  }
  if (
    firestoreDatabaseId !== null &&
    committedIdentifiers.firestoreDatabaseId !== "" &&
    firestoreDatabaseId === committedIdentifiers.firestoreDatabaseId
  ) {
    collisions.push("VITE_FIRESTORE_DATABASE_ID");
  }
  return collisions;
};

const resolveAlternateStagingFirestoreDatabaseId = (
  rawValue: string,
): string | null => {
  if (rawValue === "" || rawValue === DEFAULT_FIRESTORE_DATABASE_LABEL) {
    return null;
  }
  return rawValue;
};

const createDiagnostic = (
  resolved: Omit<ResolvedFirebaseClientConfiguration, "diagnostic">,
): FirebaseClientConfigurationDiagnostic => ({
  applicationEnvironment: resolved.applicationEnvironment,
  projectId: resolved.projectId,
  firestoreDatabaseId:
    resolved.firestoreDatabaseId ?? DEFAULT_FIRESTORE_DATABASE_LABEL,
  configurationSource: resolved.configurationSource,
});

const toResolvedStagingConfiguration = ({
  configurationSource,
  options,
  firestoreDatabaseId,
}: {
  configurationSource: FirebaseClientConfigurationSource;
  options: FirebaseClientFirebaseOptions;
  firestoreDatabaseId: string | null;
}): ResolvedFirebaseClientConfiguration => {
  const resolvedWithoutDiagnostic = {
    applicationEnvironment: "staging" as const,
    configurationSource,
    projectId: options.projectId,
    firebaseOptions: options,
    firestoreDatabaseId,
  };
  return {
    ...resolvedWithoutDiagnostic,
    diagnostic: createDiagnostic(resolvedWithoutDiagnostic),
  };
};

const resolveCurrentProjectFirestoreDatabaseId = ({
  rawValue,
  committedNamedDatabaseId,
}: {
  rawValue: string;
  committedNamedDatabaseId: string;
}): { firestoreDatabaseId: string | null; mismatch: boolean } => {
  if (rawValue === "") {
    return { firestoreDatabaseId: committedNamedDatabaseId, mismatch: false };
  }
  if (rawValue === DEFAULT_FIRESTORE_DATABASE_LABEL) {
    return { firestoreDatabaseId: null, mismatch: false };
  }
  if (rawValue === committedNamedDatabaseId) {
    return { firestoreDatabaseId: rawValue, mismatch: false };
  }
  return { firestoreDatabaseId: rawValue, mismatch: true };
};

const resolveDevelopmentConfiguration = (
  variables: FirebaseClientEnvironmentVariables,
  committedStagingConfig: CommittedStagingFirebaseClientConfig,
): ResolvedFirebaseClientConfiguration => {
  const appEnv = trimValue(variables.VITE_APP_ENV);
  const missing = missingStagingVariableNames(variables);
  if (missing.length > 0) {
    throw createDevelopmentConfigurationError(
      "Partial or blank staging configuration cannot silently initialize Firebase.",
      missing,
    );
  }
  if (appEnv !== APPROVED_NON_PRODUCTION_APP_ENV) {
    throw createDevelopmentConfigurationError(
      `VITE_APP_ENV must be ${APPROVED_NON_PRODUCTION_APP_ENV}. A dedicated production Firebase project has not been configured.`,
      appEnv === "" ? ["VITE_APP_ENV"] : [],
    );
  }

  const apiKey = trimValue(variables.VITE_FIREBASE_API_KEY);
  const authDomain = trimValue(variables.VITE_FIREBASE_AUTH_DOMAIN);
  const projectId = trimValue(variables.VITE_FIREBASE_PROJECT_ID);
  const storageBucket = trimValue(variables.VITE_FIREBASE_STORAGE_BUCKET);
  const messagingSenderId = trimValue(
    variables.VITE_FIREBASE_MESSAGING_SENDER_ID,
  );
  const appId = trimValue(variables.VITE_FIREBASE_APP_ID);
  const measurementId = trimValue(variables.VITE_FIREBASE_MEASUREMENT_ID);
  const rawFirestoreDatabaseId = trimValue(variables.VITE_FIRESTORE_DATABASE_ID);
  const committedIdentifiers = normalizeCommittedStagingIdentifiers(
    committedStagingConfig,
  );

  if (projectId === committedIdentifiers.projectId) {
    const firestoreResolution = resolveCurrentProjectFirestoreDatabaseId({
      rawValue: rawFirestoreDatabaseId,
      committedNamedDatabaseId: committedIdentifiers.firestoreDatabaseId,
    });
    const mismatches = collectSameProjectMismatches({
      apiKey,
      authDomain,
      storageBucket,
      messagingSenderId,
      appId,
      measurementId,
      committedIdentifiers,
    });
    if (firestoreResolution.mismatch) {
      mismatches.push("VITE_FIRESTORE_DATABASE_ID");
    }
    if (mismatches.length > 0) {
      throw createDevelopmentConfigurationError(
        "The project ID matches the committed staging Web app, but other identifiers do not. Copy every field from that same staging Web app.",
        mismatches,
      );
    }
    return toResolvedStagingConfiguration({
      configurationSource: "explicit_environment",
      options: {
        apiKey,
        authDomain,
        projectId,
        storageBucket,
        messagingSenderId,
        appId,
        measurementId,
      },
      firestoreDatabaseId: firestoreResolution.firestoreDatabaseId,
    });
  }

  const firestoreDatabaseId = resolveAlternateStagingFirestoreDatabaseId(
    rawFirestoreDatabaseId,
  );
  const collisions = collectCrossProjectCollisions({
    apiKey,
    authDomain,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId,
    firestoreDatabaseId,
    committedIdentifiers,
  });
  if (collisions.length > 0) {
    throw createDevelopmentConfigurationError(
      "Do not mix identifiers from the committed staging Web app with a different Firebase project. Copy every field from one Web app.",
      collisions,
    );
  }

  return toResolvedStagingConfiguration({
    configurationSource: "explicit_environment",
    options: {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
      measurementId,
    },
    firestoreDatabaseId,
  });
};

const resolveCommittedStagingForProductionRuntime = (
  committedStagingConfig: CommittedStagingFirebaseClientConfig,
): ResolvedFirebaseClientConfiguration => {
  const committedIdentifiers = normalizeCommittedStagingIdentifiers(
    committedStagingConfig,
  );
  if (
    committedIdentifiers.projectId === "" ||
    committedIdentifiers.apiKey === "" ||
    committedIdentifiers.authDomain === "" ||
    committedIdentifiers.storageBucket === "" ||
    committedIdentifiers.messagingSenderId === "" ||
    committedIdentifiers.appId === "" ||
    committedIdentifiers.firestoreDatabaseId === ""
  ) {
    throw new FirebaseClientConfigurationError(
      "The committed staging Firebase configuration is incomplete.",
    );
  }

  return toResolvedStagingConfiguration({
    configurationSource: "committed_staging",
    options: {
      apiKey: committedIdentifiers.apiKey,
      authDomain: committedIdentifiers.authDomain,
      projectId: committedIdentifiers.projectId,
      storageBucket: committedIdentifiers.storageBucket,
      messagingSenderId: committedIdentifiers.messagingSenderId,
      appId: committedIdentifiers.appId,
      measurementId: committedIdentifiers.measurementId,
    },
    firestoreDatabaseId: committedIdentifiers.firestoreDatabaseId,
  });
};

/**
 * Pure Firebase client configuration resolver. It performs no SDK calls and
 * does not read server environment globals or Admin credentials.
 *
 * `runtimeMode` is the Vite runtime (development vs production build).
 * The Firebase resource environment is currently staging only. A Vite
 * production build uses the committed staging Web configuration until a
 * dedicated production Firebase project is introduced.
 */
export const resolveFirebaseClientConfiguration = ({
  runtimeMode,
  variables,
  committedStagingConfig,
}: ResolveFirebaseClientConfigurationInput): ResolvedFirebaseClientConfiguration => {
  if (runtimeMode === "development") {
    return resolveDevelopmentConfiguration(variables, committedStagingConfig);
  }
  return resolveCommittedStagingForProductionRuntime(committedStagingConfig);
};

export const resolveExplicitStagingFirebaseClientConfiguration = ({
  environment,
  committedStagingConfig,
}: {
  environment: Readonly<Record<string, unknown>>;
  committedStagingConfig: CommittedStagingFirebaseClientConfig;
}): ResolvedFirebaseClientConfiguration =>
  resolveFirebaseClientConfiguration({
    runtimeMode: "development",
    variables: readFirebaseClientEnvironmentVariables(environment),
    committedStagingConfig,
  });

export const formatFirebaseClientConfigurationDiagnostic = (
  diagnostic: FirebaseClientConfigurationDiagnostic,
): string =>
  `[firebase-client] applicationEnvironment=${diagnostic.applicationEnvironment} projectId=${diagnostic.projectId} firestoreDatabaseId=${diagnostic.firestoreDatabaseId} configurationSource=${diagnostic.configurationSource}`;

export const initializeResolvedFirebaseClient = <TApp>(
  resolved: ResolvedFirebaseClientConfiguration,
  sdk: {
    initializeApp: (options: FirebaseClientFirebaseOptions) => TApp;
    getFirestore: (app: TApp, databaseId?: string) => unknown;
    getAuth: (app: TApp) => unknown;
    getStorage: (app: TApp) => unknown;
  },
): {
  app: TApp;
  db: unknown;
  auth: unknown;
  storage: unknown;
} => {
  const app = sdk.initializeApp(resolved.firebaseOptions);
  const db =
    resolved.firestoreDatabaseId === null
      ? sdk.getFirestore(app)
      : sdk.getFirestore(app, resolved.firestoreDatabaseId);
  return {
    app,
    db,
    auth: sdk.getAuth(app),
    storage: sdk.getStorage(app),
  };
};

export const emitFirebaseClientConfigurationDiagnostic = (
  resolved: ResolvedFirebaseClientConfiguration,
  runtimeMode: FirebaseRuntimeMode,
  logger: Pick<Console, "info"> = console,
): void => {
  if (runtimeMode !== "development") return;
  logger.info(
    formatFirebaseClientConfigurationDiagnostic(resolved.diagnostic),
  );
};
