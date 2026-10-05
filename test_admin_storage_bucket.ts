import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { getApp } from "firebase-admin/app";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import { getAdminServices } from "./src/server/firebaseAdmin.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

process.env.FIREBASE_ADMIN_PROJECT_ID = firebaseConfig.projectId;
process.env.FIREBASE_ADMIN_CLIENT_EMAIL =
  "admin-storage-bucket-test@example.iam.gserviceaccount.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = privateKey;

const services = getAdminServices();
const app = getApp();

assert.equal(app.options.projectId, firebaseConfig.projectId);
assert.equal(app.options.storageBucket, firebaseConfig.storageBucket);
assert.equal(
  app.options.storageBucket,
  "gen-lang-client-0614710868.firebasestorage.app",
);

const bucket = services.storage.bucket();
assert.equal(bucket.name, firebaseConfig.storageBucket);

console.log("PASS: Admin app storage bucket matches the client config");
