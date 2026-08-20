/**
 * Compatibility re-export of the canonical Firebase client initializer.
 * Do not add a second Firebase app bootstrap here.
 */
export {
  app,
  db,
  storage,
  firebaseClientConfiguration,
} from "../services/firebase";
