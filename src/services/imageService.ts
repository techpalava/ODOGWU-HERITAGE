import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";
import { v4 as uuidv4 } from "uuid";
import { MediaRepository } from "../repositories/MediaRepository";

export const ImageService = {
  /**
   * Checks if a string is a base64 image data URL.
   */
  isBase64Image: (url: string | null | undefined): boolean => {
    return typeof url === 'string' && url.startsWith("data:image");
  },

  /**
   * Uploads a base64 image to Firebase Storage and returns the download URL.
   * If the input is not a base64 image, it returns the input unchanged.
   */
  uploadImageIfBase64: async (
    imageStr: string | null | undefined,
    folder: string,
    idPrefix: string = ""
  ): Promise<string | null | undefined> => {
    console.log("[ImageService.uploadImageIfBase64] Start. folder:", folder, "idPrefix:", idPrefix);
    if (!imageStr || !ImageService.isBase64Image(imageStr)) {
      console.log("[ImageService.uploadImageIfBase64] Not base64, returning");
      return imageStr;
    }

    try {
      const originalFileName = `${idPrefix || 'image'}.webp`;
      console.log("[ImageService.uploadImageIfBase64] Calling MediaRepository.upload...");
      const metadata = await MediaRepository.upload(
          imageStr, 
          folder, 
          idPrefix || "misc", 
          originalFileName, 
          "admin", // Default for now
          `${folder} - ${idPrefix}`
      );
      console.log("[ImageService.uploadImageIfBase64] Upload complete. URL:", metadata.url);
      return metadata.url;
    } catch (error) {
      console.error(`[ImageService.uploadImageIfBase64] Failed to upload image to folder ${folder}:`, error);
      throw error; // Do not fallback to base64 to prevent oversized Firestore payloads
    }
  },

  /**
   * Recursively traverses an object and uploads any base64 images it finds to Storage.
   */
  uploadAllImagesInObject: async (
    obj: any,
    folder: string,
    idPrefix: string = ""
  ): Promise<any> => {
    if (obj === undefined || obj === null) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return Promise.all(obj.map(item => ImageService.uploadAllImagesInObject(item, folder, idPrefix)));
    }
    if (typeof obj === "object") {
      const newObj: any = {};
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === "string" && ImageService.isBase64Image(obj[key])) {
          newObj[key] = await ImageService.uploadImageIfBase64(obj[key], folder, idPrefix);
        } else {
          newObj[key] = await ImageService.uploadAllImagesInObject(obj[key], folder, idPrefix);
        }
      }
      return newObj;
    }
    return obj;
  },

  /**
   * Recursively traverses an object and deletes any Firebase Storage URLs it finds.
   */
  deleteAllImagesInObject: async (obj: any): Promise<void> => {
    if (obj === undefined || obj === null) {
      return;
    }
    if (Array.isArray(obj)) {
      await Promise.all(obj.map(item => ImageService.deleteAllImagesInObject(item)));
      return;
    }
    if (typeof obj === "object") {
      await Promise.all(Object.keys(obj).map(async (key) => {
        if (typeof obj[key] === "string" && obj[key].includes("firebasestorage.googleapis.com")) {
          await ImageService.deleteImageFromStorage(obj[key]);
        } else {
          await ImageService.deleteAllImagesInObject(obj[key]);
        }
      }));
    }
  },

  deleteImageFromStorage: async (imageUrl: string) => {
    if (imageUrl && imageUrl.includes("firebasestorage.googleapis.com")) {
      try {
        await MediaRepository.delete(imageUrl);
      } catch (e) {
        console.warn("Failed to delete image from storage", e);
      }
    }
  }
};
