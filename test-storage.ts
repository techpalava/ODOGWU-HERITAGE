import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function test() {
  try {
    const r = ref(storage, "test.txt");
    const snap = await uploadString(r, "hello", "raw");
    const url = await getDownloadURL(snap.ref);
    console.log("Success! URL:", url);
  } catch (e: any) {
    console.error("Failed:", e.code, e.message);
  }
}
test();
