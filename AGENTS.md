# Agent Instructions

## Universal Fabric Import via AI Prompt

When a user asks you to "upload this fabric", "identify this fabric", "add this fabric", or "create catalogue item" and attaches an image, you MUST initiate the Universal Fabric Import Workflow.

To do this, you MUST NOT ask the user to use the UI. Instead, use the `shell_exec` tool to run a script that uploads the image and writes a draft to the `fabric_drafts` Firestore collection. 

The frontend `DatabaseView.tsx` component is listening to `fabric_drafts`. Once the draft is written, the frontend will automatically pop up the Add Fabric form, pre-populated, for the administrator to review.

**Process for the AI Agent:**
1. Determine the path of the uploaded image file in the AI Studio environment (usually `src/assets/images/...`).
2. Run the helper script using the shell_exec tool:
   `npx -y tsx src/scripts/aiImportFabric.ts "src/assets/images/uploaded_file.jpg"`
3. Inform the user that the import workflow has been initiated and they should review the populated form in the Fabric Catalogue UI.

Do NOT manually create the fabric item in the `fabrics` collection unless explicitly requested. The user expects to review the auto-populated form and click "Save Fabric Settings" themselves.
