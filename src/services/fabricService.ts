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
      const fabrics = snapshot.docs.map(doc => ({ ...doc.data() } as Fabric));
      callback(fabrics);
    }, (error) => {
      console.error("Error subscribing to fabrics:", error);
    });
  },

  // Add or Update Fabric
  saveFabric: async (fabric: Fabric) => {
    console.log("[FabricService.saveFabric] Start. fabric:", fabric);
    try {
      const docRef = doc(db, FABRICS_COLLECTION, fabric.code);
      console.log("[FabricService.saveFabric] Checking old snapshot for code:", fabric.code);
      const oldSnap = await getDoc(docRef);
      const oldData = oldSnap.exists() ? oldSnap.data() as Fabric : null;
      console.log("[FabricService.saveFabric] oldData exists?", !!oldData);

      let finalImageUrl = fabric.image;

      // Check if image is a base64 string (meaning it was newly uploaded via compressImage)
      if (fabric.image && ImageService.isBase64Image(fabric.image)) {
        console.log("[FabricService.saveFabric] Image is base64, uploading...");
        const uploadedUrl = await ImageService.uploadImageIfBase64(fabric.image, "fabrics", fabric.code);
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

      console.log("[FabricService.saveFabric] Writing to Firestore:", sanitizedFabric);
      await setDoc(doc(db, FABRICS_COLLECTION, fabric.code), sanitizedFabric);
      console.log("[FabricService.saveFabric] Firestore write complete");
      return fabricToSave;
    } catch (error) {
      console.error("[FabricService.saveFabric] Error saving fabric:", error);
      throw error;
    }
  },

  // Delete Fabric
  deleteFabric: async (fabric: Fabric) => {
    try {
      // 1. Delete from Firestore
      await deleteDoc(doc(db, FABRICS_COLLECTION, fabric.code));

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
