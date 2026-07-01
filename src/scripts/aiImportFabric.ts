import {  setDoc, doc } from "firebase/firestore";
import { db } from "../services/firebase";
import { ImageService } from "../services/imageService";
import fs from "fs";
import path from "path";

async function run() {
  const imagePath = process.argv[2];
  
  if (!imagePath) {
    console.error("Usage: npx tsx src/scripts/aiImportFabric.ts <image_path>");
    process.exit(1);
  }

  try {
    const fullPath = path.resolve(process.cwd(), imagePath);
    console.log(`Reading image from ${fullPath}...`);
    
    if (!fs.existsSync(fullPath)) {
       console.error(`File not found: ${fullPath}`);
       process.exit(1);
    }
    
    const imageBuffer = fs.readFileSync(fullPath);
    const mimeType = fullPath.endsWith('.png') ? 'image/png' : (fullPath.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
    const base64Image = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
    
    console.log("Uploading to Firebase Storage...");
    const uploadedUrl = await ImageService.uploadImageIfBase64(base64Image, "fabrics", "draft");
    
    if (!uploadedUrl || uploadedUrl.startsWith("data:")) {
      throw new Error("Failed to upload image or get URL");
    }
    
    console.log(`Image uploaded successfully: ${uploadedUrl}`);
    
    console.log("Creating draft in fabric_drafts collection...");
    const draftId = `draft_${Date.now()}`;
    await setDoc(doc(db, "fabric_drafts", draftId), {
      image: uploadedUrl,
      createdAt: new Date().toISOString()
    });
    
    console.log("Fabric draft successfully created! The UI should automatically pick it up.");
    process.exit(0);
  } catch (err) {
    console.error("Error creating fabric draft:", err);
    process.exit(1);
  }
}

run();
