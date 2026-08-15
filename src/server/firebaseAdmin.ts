import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import firebaseConfig from "../../firebase-applet-config.json" with {
  type: "json",
};

function getAdminApp(): App {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID || firebaseConfig.projectId;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );

  return initializeApp({
    credential:
      clientEmail && privateKey
        ? cert({ projectId, clientEmail, privateKey })
        : applicationDefault(),
    projectId,
  });
}

const requireExplicitProjectId = (projectId: string): string => {
  if (
    projectId !== projectId.trim() ||
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
  ) {
    throw new Error("A valid explicit Firebase project ID is required.");
  }
  return projectId;
};

function getProjectBoundAdminApp(inputProjectId: string): App {
  const projectId = requireExplicitProjectId(inputProjectId);
  const appName = `staff-preview-entitlement-${projectId}`;
  const existingApp = getApps().find((app) => app.name === appName);
  if (existingApp) {
    if (existingApp.options.projectId !== projectId) {
      throw new Error("The initialized Firebase Admin project does not match.");
    }
    return existingApp;
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );
  const adminApp = initializeApp(
    {
      credential:
        clientEmail && privateKey
          ? cert({ projectId, clientEmail, privateKey })
          : applicationDefault(),
      projectId,
    },
    appName,
  );
  if (adminApp.options.projectId !== projectId) {
    throw new Error("The initialized Firebase Admin project does not match.");
  }
  return adminApp;
}

export function getAdminServices() {
  const adminApp = getAdminApp();
  return {
    auth: getAuth(adminApp),
    db: getFirestore(adminApp, firebaseConfig.firestoreDatabaseId),
    storage: getStorage(adminApp),
  };
}

export function getProjectBoundAdminServices(projectId: string) {
  const adminApp = getProjectBoundAdminApp(projectId);
  const resolvedProjectId = adminApp.options.projectId;
  if (resolvedProjectId !== projectId) {
    throw new Error("The initialized Firebase Admin project does not match.");
  }
  return {
    projectId: resolvedProjectId,
    auth: getAuth(adminApp),
    db: getFirestore(adminApp, firebaseConfig.firestoreDatabaseId),
  };
}
