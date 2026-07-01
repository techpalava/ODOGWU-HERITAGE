import { db } from "./firebase";
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import { Fabric } from "../types";
import { ImageService } from "./imageService";

const FABRICS_COLLECTION = "fabrics";

function sanitizeForFirestore(val: any): any {
  if (val === undefined) {
    return null;
  }
  if (val === null) {
    return null;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeForFirestore);
  }
  if (typeof val === "object") {
    const res: any = {};
    for (const key of Object.keys(val)) {
      const sanitized = sanitizeForFirestore(val[key]);
      if (sanitized !== undefined) {
        res[key] = sanitized;
      }
    }
    return res;
  }
  return val;
}

export const FabricService = {
  // Subscribe to real-time changes
  subscribeToFabrics: (callback: (fabrics: Fabric[]) => void) => {
    return onSnapshot(collection(db, FABRICS_COLLECTION), (snapshot) => {
      const fabrics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Fabric));
      callback(fabrics);
    }, (error) => {
      console.error("Error subscribing to fabrics:", error);
    });
  },

  // Add or Update Fabric
  saveFabric: async (fabric: Fabric, isNewRecord: boolean = false) => {
    console.log("[FabricService.saveFabric] Start. fabric:", fabric, "isNewRecord:", isNewRecord);
    try {
      const docRef = doc(db, FABRICS_COLLECTION, fabric.id || fabric.code);
      console.log("[FabricService.saveFabric] Checking old snapshot for docId:", docRef.id);
      const oldSnap = await getDoc(docRef);
      const oldData = oldSnap.exists() ? oldSnap.data() as Fabric : null;
      console.log("[FabricService.saveFabric] oldData exists?", !!oldData);

      let finalImageUrl = fabric.image;

      // Check if image is a base64 string (meaning it was newly uploaded via compressImage)
      if (fabric.image && ImageService.isBase64Image(fabric.image)) {
        console.log("[FabricService.saveFabric] Image is base64, uploading...");
        const uploadedUrl = await ImageService.uploadImageIfBase64(fabric.image, "fabrics", isNewRecord ? "draft" : fabric.code);
        finalImageUrl = uploadedUrl || finalImageUrl;
        console.log("[FabricService.saveFabric] Image uploaded. new URL:", finalImageUrl);

        // Delete old image if it was replaced
        if (oldData && oldData.image && oldData.image.includes("firebasestorage.googleapis.com")) {
          console.log("[FabricService.saveFabric] Deleting old image:", oldData.image);
          await ImageService.deleteImageFromStorage(oldData.image);
        }
      }

      const fabricToSave = {
        ...fabric,
        image: finalImageUrl,
        updatedAt: new Date().toISOString(),
      };
      console.log("[FabricService.saveFabric] Creating fabricToSave");

      if (!fabric.createdAt) {
         fabricToSave.createdAt = new Date().toISOString();
      }

      console.log("[FabricService.saveFabric] Sanitizing fabricToSave");
      const sanitizedFabric = sanitizeForFirestore(fabricToSave);

      if (isNewRecord) {
        console.log("[FabricService.saveFabric] Processing transaction for new record code assignment");
        const { runTransaction, getDocs } = await import("firebase/firestore");
        
        // 1. Get max fallback if sequence doc is missing (outside transaction)
        const existingDocs = await getDocs(collection(db, "fabrics"));
        let maxNum = 0;
        existingDocs.forEach(d => {
          const codeStr = d.data().code;
          if (codeStr && codeStr.startsWith("ODG-")) {
            const num = parseInt(codeStr.substring(4), 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        });
        const fallbackNext = maxNum + 1;

        // 2. Transaction for atomic increment and save
        return await runTransaction(db, async (transaction) => {
          const seqRef = doc(db, "settings", "fabricSequence");
          const seqDoc = await transaction.get(seqRef);
          let nextCodeNum = fallbackNext;
          
          if (seqDoc.exists()) {
            nextCodeNum = (seqDoc.data().current || 0) + 1;
            // Ensure nextCodeNum is at least fallbackNext to avoid conflicts
            if (nextCodeNum < fallbackNext) {
               nextCodeNum = fallbackNext;
            }
          }

          const actualCode = `ODG-${String(nextCodeNum).padStart(3, "0")}`;
          transaction.set(seqRef, { current: nextCodeNum }, { merge: true });
          
          sanitizedFabric.code = actualCode;
          sanitizedFabric.id = actualCode;
          
          const newDocRef = doc(db, FABRICS_COLLECTION, actualCode);
          transaction.set(newDocRef, sanitizedFabric);
          
          console.log(`[FabricService.saveFabric] Transaction complete. Assigned code: ${actualCode}`);
          return sanitizedFabric;
        });
      } else {
        console.log("[FabricService.saveFabric] Writing to Firestore:", sanitizedFabric);
        await setDoc(doc(db, FABRICS_COLLECTION, fabric.id || fabric.code), sanitizedFabric);
        console.log("[FabricService.saveFabric] Firestore write complete");
        return fabricToSave;
      }
    } catch (error) {
      console.error("[FabricService.saveFabric] Error saving fabric:", error);
      throw error;
    }
  },

  // Delete Fabric
  deleteFabric: async (fabric: Fabric) => {
    try {
      // 1. Delete from Firestore
      await deleteDoc(doc(db, FABRICS_COLLECTION, fabric.id || fabric.code));

      // 2. Optionally delete from Storage if it's a firebase storage URL
      if (fabric.image && fabric.image.includes("firebasestorage.googleapis.com")) {
        await ImageService.deleteImageFromStorage(fabric.image);
      }
    } catch (error) {
      console.error("Error deleting fabric:", error);
      throw error;
    }
  }
};
