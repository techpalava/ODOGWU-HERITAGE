export const APPROVED_NON_PRODUCTION_APP_ENV = "staging" as const;
export const DEFAULT_FIRESTORE_DATABASE_LABEL = "(default)";

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
  | "committed_production";

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

export interface CommittedProductionFirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  firestoreDatabaseId: string;
}

export interface CommittedProductionFirebaseIdentifiers {
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
  committedProductionConfig: CommittedProductionFirebaseClientConfig;
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

export const normalizeCommittedProductionIdentifiers = (
  config: CommittedProductionFirebaseClientConfig,
): CommittedProductionFirebaseIdentifiers => ({
  apiKey: trimValue(config.apiKey),
  authDomain: trimValue(config.authDomain),
  projectId: trimValue(config.projectId),
  storageBucket: trimValue(config.storageBucket),
  messagingSenderId: trimValue(config.messagingSenderId),
  appId: trimValue(config.appId),
  measurementId: trimValue(config.measurementId),
  firestoreDatabaseId: trimValue(config.firestoreDatabaseId),
});

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
    `Firebase client initialization is blocked because the runtime mode is unknown or contradictory (DEV=${String(environment.DEV)}, PROD=${String(environment.PROD)}, MODE=${mode || "(empty)"}). Use npm run dev with a staging .env.local, or a normal production Vite build. vite build --mode staging is not supported.`,
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
    `Local Firebase initialization is blocked because no explicit non-production configuration is present. Create an ignored \`.env.local\` using the Firebase web configuration from the staging project. Set VITE_APP_ENV=${APPROVED_NON_PRODUCTION_APP_ENV} and copy every VITE_FIREBASE_* field from the same staging Web app.${missingList} ${detail}`,
  );
};

const collectProductionIdentifierCollisions = ({
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId,
  measurementId,
  firestoreDatabaseId,
  productionIdentifiers,
}: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
  firestoreDatabaseId: string | null;
  productionIdentifiers: CommittedProductionFirebaseIdentifiers;
}): string[] => {
  const collisions: string[] = [];
  if (
    apiKey !== "" &&
    productionIdentifiers.apiKey !== "" &&
    apiKey === productionIdentifiers.apiKey
  ) {
    collisions.push("VITE_FIREBASE_API_KEY");
  }
  if (
    authDomain !== "" &&
    productionIdentifiers.authDomain !== "" &&
    authDomain === productionIdentifiers.authDomain
  ) {
    collisions.push("VITE_FIREBASE_AUTH_DOMAIN");
  }
  if (
    projectId !== "" &&
    productionIdentifiers.projectId !== "" &&
    projectId === productionIdentifiers.projectId
  ) {
    collisions.push("VITE_FIREBASE_PROJECT_ID");
  }
  if (
    storageBucket !== "" &&
    productionIdentifiers.storageBucket !== "" &&
    storageBucket === productionIdentifiers.storageBucket
  ) {
    collisions.push("VITE_FIREBASE_STORAGE_BUCKET");
  }
  if (
    messagingSenderId !== "" &&
    productionIdentifiers.messagingSenderId !== "" &&
    messagingSenderId === productionIdentifiers.messagingSenderId
  ) {
    collisions.push("VITE_FIREBASE_MESSAGING_SENDER_ID");
  }
  if (
    appId !== "" &&
    productionIdentifiers.appId !== "" &&
    appId === productionIdentifiers.appId
  ) {
    collisions.push("VITE_FIREBASE_APP_ID");
  }
  if (
    productionIdentifiers.measurementId !== "" &&
    measurementId !== "" &&
    measurementId === productionIdentifiers.measurementId
  ) {
    collisions.push("VITE_FIREBASE_MEASUREMENT_ID");
  }
  if (
    firestoreDatabaseId !== null &&
    productionIdentifiers.firestoreDatabaseId !== "" &&
    firestoreDatabaseId === productionIdentifiers.firestoreDatabaseId
  ) {
    collisions.push("VITE_FIRESTORE_DATABASE_ID");
  }
  return collisions;
};

const resolveStagingFirestoreDatabaseId = (
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

const toResolvedConfiguration = ({
  applicationEnvironment,
  configurationSource,
  options,
  firestoreDatabaseId,
}: {
  applicationEnvironment: FirebaseApplicationEnvironment;
  configurationSource: FirebaseClientConfigurationSource;
  options: FirebaseClientFirebaseOptions;
  firestoreDatabaseId: string | null;
}): ResolvedFirebaseClientConfiguration => {
  const resolvedWithoutDiagnostic = {
    applicationEnvironment,
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

const resolveDevelopmentConfiguration = (
  variables: FirebaseClientEnvironmentVariables,
  committedProductionConfig: CommittedProductionFirebaseClientConfig,
): ResolvedFirebaseClientConfiguration => {
  const appEnv = trimValue(variables.VITE_APP_ENV);
  const missing = missingStagingVariableNames(variables);
  if (missing.length > 0) {
    throw createDevelopmentConfigurationError(
      "Partial or blank staging configuration cannot fall back to the committed production Firebase project.",
      missing,
    );
  }
  if (appEnv !== APPROVED_NON_PRODUCTION_APP_ENV) {
    throw createDevelopmentConfigurationError(
      `VITE_APP_ENV must be ${APPROVED_NON_PRODUCTION_APP_ENV}.`,
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
  const firestoreDatabaseId = resolveStagingFirestoreDatabaseId(
    trimValue(variables.VITE_FIRESTORE_DATABASE_ID),
  );
  const productionIdentifiers = normalizeCommittedProductionIdentifiers(
    committedProductionConfig,
  );
  const collisions = collectProductionIdentifierCollisions({
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId,
    firestoreDatabaseId,
    productionIdentifiers,
  });
  if (collisions.length > 0) {
    throw createDevelopmentConfigurationError(
      "Do not mix staging and production Firebase web configuration. Copy every field from the same staging Web app.",
      collisions,
    );
  }

  return toResolvedConfiguration({
    applicationEnvironment: "staging",
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

const resolveProductionConfiguration = (
  committedProductionConfig: CommittedProductionFirebaseClientConfig,
): ResolvedFirebaseClientConfiguration => {
  const productionIdentifiers = normalizeCommittedProductionIdentifiers(
    committedProductionConfig,
  );
  if (
    productionIdentifiers.projectId === "" ||
    productionIdentifiers.apiKey === "" ||
    productionIdentifiers.authDomain === "" ||
    productionIdentifiers.storageBucket === "" ||
    productionIdentifiers.messagingSenderId === "" ||
    productionIdentifiers.appId === "" ||
    productionIdentifiers.firestoreDatabaseId === ""
  ) {
    throw new FirebaseClientConfigurationError(
      "The committed production Firebase configuration is incomplete.",
    );
  }

  return toResolvedConfiguration({
    applicationEnvironment: "production",
    configurationSource: "committed_production",
    options: {
      apiKey: productionIdentifiers.apiKey,
      authDomain: productionIdentifiers.authDomain,
      projectId: productionIdentifiers.projectId,
      storageBucket: productionIdentifiers.storageBucket,
      messagingSenderId: productionIdentifiers.messagingSenderId,
      appId: productionIdentifiers.appId,
      measurementId: productionIdentifiers.measurementId,
    },
    firestoreDatabaseId: productionIdentifiers.firestoreDatabaseId,
  });
};

/**
 * Pure Firebase client configuration resolver. It performs no SDK calls and
 * does not read server environment globals or Admin credentials.
 */
export const resolveFirebaseClientConfiguration = ({
  runtimeMode,
  variables,
  committedProductionConfig,
}: ResolveFirebaseClientConfigurationInput): ResolvedFirebaseClientConfiguration => {
  if (runtimeMode === "development") {
    return resolveDevelopmentConfiguration(
      variables,
      committedProductionConfig,
    );
  }
  return resolveProductionConfiguration(committedProductionConfig);
};

export const resolveExplicitStagingFirebaseClientConfiguration = ({
  environment,
  committedProductionConfig,
}: {
  environment: Readonly<Record<string, unknown>>;
  committedProductionConfig: CommittedProductionFirebaseClientConfig;
}): ResolvedFirebaseClientConfiguration =>
  resolveFirebaseClientConfiguration({
    runtimeMode: "development",
    variables: readFirebaseClientEnvironmentVariables(environment),
    committedProductionConfig,
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
