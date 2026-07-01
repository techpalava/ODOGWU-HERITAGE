import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";
import { v4 as uuidv4 } from "uuid";

export const ImageService = {
  uploadImageIfBase64: async (base64OrUrl: string, pathPrefix: string = "images", metadata?: any): Promise<string> => {
    if (!base64OrUrl || !base64OrUrl.startsWith("data:image")) {
      return base64OrUrl;
    }

    try {
      const id = uuidv4();
      // Extract mime type from base64 string
      const mimeType = base64OrUrl.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)?.[1] || "image/jpeg";
      const extension = mimeType.split('/')[1] || "jpg";
      const filename = `${pathPrefix}/${id}.${extension}`;
      
      const storageRef = ref(storage, filename);
      
      const uploadMetadata = {
        contentType: mimeType,
        customMetadata: metadata || {}
      };

      await uploadString(storageRef, base64OrUrl, 'data_url', uploadMetadata);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Error uploading image:", error);
      throw error;
    }
  },

  isBase64Image: (str: string): boolean => {
    return !!str && str.startsWith("data:image");
  },

  deleteImageFromStorage: async (url: string): Promise<void> => {
    if (!url || !url.includes("firebasestorage.googleapis.com")) return;
    
    try {
      // Create a reference from the URL
      const fileRef = ref(storage, url);
      await deleteObject(fileRef);
    } catch (error) {
      console.error("Error deleting image:", error);
    }
  },

  uploadAllImagesInObject: async (obj: any, pathPrefix: string = "images", id?: string): Promise<any> => {
    if (!obj) return obj;
    
    if (Array.isArray(obj)) {
      return Promise.all(obj.map(item => ImageService.uploadAllImagesInObject(item, pathPrefix, id)));
    }
    
    if (typeof obj === 'object') {
      const newObj = { ...obj };
      for (const [key, value] of Object.entries(newObj)) {
        if (typeof value === 'string' && ImageService.isBase64Image(value)) {
          newObj[key] = await ImageService.uploadImageIfBase64(value, pathPrefix, { refId: id });
        } else if (typeof value === 'object') {
          newObj[key] = await ImageService.uploadAllImagesInObject(value, pathPrefix, id);
        }
      }
      return newObj;
    }
    
    return obj;
  },

  deleteAllImagesInObject: async (obj: any): Promise<void> => {
    if (!obj) return;
    
    if (Array.isArray(obj)) {
      await Promise.all(obj.map(item => ImageService.deleteAllImagesInObject(item)));
      return;
    }
    
    if (typeof obj === 'object') {
      for (const value of Object.values(obj)) {
        if (typeof value === 'string' && value.includes("firebasestorage.googleapis.com")) {
          await ImageService.deleteImageFromStorage(value);
        } else if (typeof value === 'object') {
          await ImageService.deleteAllImagesInObject(value);
        }
      }
    }
  }
};
