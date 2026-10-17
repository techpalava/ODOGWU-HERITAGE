import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase.js";
import {
  SITE_FEEDBACK_COLLECTION,
  buildSiteFeedbackCreatePayload,
  type SiteFeedbackContext,
  type SiteFeedbackValidation,
} from "../utils/siteFeedback.js";

/** Create-only write; firestore.rules forbids client reads, edits and deletes. */
export async function submitSiteFeedback(
  value: Extract<SiteFeedbackValidation, { ok: true }>["value"],
  context: SiteFeedbackContext,
): Promise<string> {
  // The rules accept only the caller's own Firebase uid (or none).
  const firebaseUser = auth.currentUser;
  const uid = firebaseUser && !firebaseUser.isAnonymous ? firebaseUser.uid : null;
  const ref = doc(collection(db, SITE_FEEDBACK_COLLECTION));
  await setDoc(
    ref,
    buildSiteFeedbackCreatePayload(value, { ...context, uid }, serverTimestamp()),
  );
  return ref.id;
}
