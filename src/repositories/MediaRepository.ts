import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where, getDocs } from "firebase/firestore";
import { storage, db } from "../services/firebase";
import { v4 as uuidv4 } from "uuid";

export interface MediaMetadata {
  id: string;
  url: string; // The primary download URL
  storagePath: string; // e.g. logos/partners/vaprec-fashion.png
  fileName: string;
  originalFileName: string;
  uploadDate: string;
  updatedDate: string;
  uploadedBy: string;
  imageCategory: string; // e.g. "hero", "gallery"
  relatedEntityId: string; // e.g. "batch-05"
  fileSize?: number;
  mimeType: string;
  activeStatus: "active" | "deleted";
  usedBy: string[]; // e.g. ["Fabric ODG-028", "Hero Banner"]
  
  // Future architecture for image variants
  variants?: {
    original?: string;
    large?: string;
    medium?: string;
    thumbnail?: string;
    webp?: string;
  };
}

export const MediaRepository = {
  /**
   * Automatically sanitize filenames and replace random filenames with predictable paths
   */
  generateStoragePath: (category: string, entityId: string, originalFileName: string): string => {
    const sanitizedEntityId = (entityId || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const extMatch = originalFileName.match(/\.([^\.]+)$/);
    const ext = extMatch ? `.${extMatch[1]}` : ".webp";
    
    const timestamp = Date.now();
    const sanitizedName = originalFileName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(new RegExp(`${ext}$`), "") || "image";
    
    if (category === 'fabrics') {
      return `fabrics/${sanitizedEntityId}/main_${timestamp}${ext}`;
    } else if (category === 'logos' || category === 'settings') {
      return `logos/${sanitizedEntityId}/${sanitizedName}_${timestamp}${ext}`;
    } else if (category === 'gallery' || category === 'communityPhotos') {
      return `gallery/${sanitizedEntityId}/${sanitizedName}_${timestamp}${ext}`;
    } else if (category === 'hero') {
      return `hero/homepage/${sanitizedName}_${timestamp}${ext}`;
    } else if (category === 'designs' || category === 'styles') {
      return `designs/${sanitizedEntityId}/${sanitizedName}_${timestamp}${ext}`;
    } else {
      return `${category}/${sanitizedEntityId}/${sanitizedName}_${timestamp}${ext}`;
    }
  },

  upload: async (
    base64Data: string, 
    category: string, 
    entityId: string, 
    originalFileName: string, 
    uploaderId: string = "admin",
    usageContext: string = ""
  ): Promise<MediaMetadata> => {
    console.log("[MediaRepository.upload] Start. category:", category, "entityId:", entityId, "originalFileName:", originalFileName);
    // Determine mimeType from base64 string
    const mimeMatch = base64Data.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    
    // Determine extension based on mimetype if not in filename
    let ext = ".jpg";
    if (mimeType.includes("png")) ext = ".png";
    else if (mimeType.includes("webp")) ext = ".webp";
    else if (mimeType.includes("gif")) ext = ".gif";

    if (!originalFileName.includes(".")) {
      originalFileName += ext;
    }
    
    const storagePath = MediaRepository.generateStoragePath(category, entityId, originalFileName);
    const storageRef = ref(storage, storagePath);
    
    // Upload to Firebase Storage
    console.log("[MediaRepository.upload] Uploading to Firebase Storage at:", storagePath);
    try {
      const snapshot = await uploadString(storageRef, base64Data, 'data_url');
      console.log("[MediaRepository.upload] Firebase Storage upload successful");
      const downloadURL = await getDownloadURL(snapshot.ref);
      const id = uuidv4();

      // Create Metadata
      const metadata: MediaMetadata = {
        id,
        url: downloadURL,
        storagePath,
        fileName: storagePath.split('/').pop() || originalFileName,
        originalFileName,
        uploadDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
        uploadedBy: uploaderId,
        imageCategory: category,
        relatedEntityId: entityId,
        mimeType,
        activeStatus: "active",
        usedBy: usageContext ? [usageContext] : [],
        variants: {
          original: downloadURL
        }
      };

      console.log("[MediaRepository.upload] Saving metadata to Firestore");
      // Save metadata in Firestore
      await setDoc(doc(db, "media", id), metadata);
      console.log("[MediaRepository.upload] Complete!");
      return metadata;
    } catch (error) {
      console.error("[MediaRepository.upload] Error:", error);
      throw error;
    }
  },

  getDownloadURL: async (storagePath: string): Promise<string> => {
    const storageRef = ref(storage, storagePath);
    return await getDownloadURL(storageRef);
  },

  getMetadata: async (id: string): Promise<MediaMetadata | null> => {
    const docSnap = await getDoc(doc(db, "media", id));
    if (docSnap.exists()) {
      return docSnap.data() as MediaMetadata;
    }
    return null;
  },

  findByUrl: async (url: string): Promise<MediaMetadata | null> => {
      const q = query(collection(db, "media"), where("url", "==", url));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        return querySnapshot.docs[0].data() as MediaMetadata;
      }
      return null;
  },

  delete: async (url: string): Promise<void> => {
    if (!url || !url.includes("firebasestorage.googleapis.com")) return;
    
    const metadata = await MediaRepository.findByUrl(url);
    if (metadata) {
      if (metadata.usedBy.length > 1) {
        console.warn(`Media ${metadata.id} is used in multiple places. Not deleting from storage.`);
        // Note: Could update usedBy array here depending on how we handle it.
        return;
      }
      
      try {
        const imageRef = ref(storage, metadata.storagePath);
        await deleteObject(imageRef);
        await deleteDoc(doc(db, "media", metadata.id));
      } catch (e) {
        console.warn("Failed to delete media", e);
      }
    } else {
      // Fallback if no metadata found
      try {
        const imageRef = ref(storage, url);
        await deleteObject(imageRef);
      } catch (e) {
        console.warn("Failed to delete media fallback", e);
      }
    }
  },

  registerUsage: async (url: string, context: string): Promise<void> => {
      if (!url || !url.includes("firebasestorage.googleapis.com")) return;
      const metadata = await MediaRepository.findByUrl(url);
      if (metadata) {
          if (!metadata.usedBy.includes(context)) {
              await updateDoc(doc(db, "media", metadata.id), {
                  usedBy: [...metadata.usedBy, context],
                  updatedDate: new Date().toISOString()
              });
          }
      }
  },

  removeUsage: async (url: string, context: string): Promise<void> => {
      if (!url || !url.includes("firebasestorage.googleapis.com")) return;
      const metadata = await MediaRepository.findByUrl(url);
      if (metadata) {
          const newUsedBy = metadata.usedBy.filter(c => c !== context);
          await updateDoc(doc(db, "media", metadata.id), {
              usedBy: newUsedBy,
              updatedDate: new Date().toISOString()
          });
      }
  }
};
