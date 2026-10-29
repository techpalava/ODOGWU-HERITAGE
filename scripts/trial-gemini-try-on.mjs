#!/usr/bin/env node
/**
 * Local-only trial of two Gemini image models with one virtual try-on prompt.
 *
 * This script is not imported by the app, Design Studio, or any API route.
 * It does not change step order or write to Firebase.
 *
 * Models (same prompt, same images, same response modalities):
 *   - gemini-2.5-flash-image
 *   - gemini-2.0-flash-preview-image-generation
 *
 * The 2.0 preview model rejects image-only output, so both calls send
 * responseModalities TEXT and IMAGE. Only the model id changes.
 *
 * Setup
 *   Put GEMINI_API_KEY in the environment, or in a gitignored .env.local or .env
 *   at the repo root. The placeholder in .env.example is ignored.
 *   Never commit the key. This script never prints it.
 *
 * Run (paths are relative to the current working directory):
 *   npm run trial:gemini-try-on -- \
 *     --person path/to/person.jpg \
 *     --garment path/to/garment.jpg
 *
 *   node scripts/trial-gemini-try-on.mjs --person <photo> --garment <image>
 *   # --design is an alias for --garment. Positional args are person, then garment.
 *
 *   # Validate paths and print the plan. Does not call Gemini.
 *   npm run trial:gemini-try-on -- --dry-run --person <photo> --garment <image>
 *
 * Inputs already in the repo (catalogue / marketing assets, not customer photos).
 * Do not commit customer photos. Pass a local person photo and leave it untracked.
 *
 *   Garment (mannequin kaftan):
 *     src/assets/images/executive_kaftan_photo_1782308137246.jpg
 *
 *   Person stand-in (marketing concept with UI chrome; a weak try-on input):
 *     src/assets/images/virtual_tryon_concept_1782563183054.jpg
 *
 * Example:
 *   npm run trial:gemini-try-on -- \
 *     --person src/assets/images/virtual_tryon_concept_1782563183054.jpg \
 *     --garment src/assets/images/executive_kaftan_photo_1782308137246.jpg
 *
 * Each result image is written under scripts/trial-gemini-try-on-out/ (gitignored).
 * The script prints SUCCESS or FAILURE and latency in milliseconds per model.
 */

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Modality } from "@google/genai";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Existing process.env wins. Then .env.local, then .env. Missing files are ignored.
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, ".env"), quiet: true });

const MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
];

const OUTPUT_DIR = path.join(root, "scripts", "trial-gemini-try-on-out");

const TRY_ON_PROMPT = [
  "Virtual clothing try-on.",
  "The first image is a photo of a person.",
  "The second image is the garment or design to try on.",
  "Edit the person photo so that person is wearing the garment from the second image.",
  "Keep the person's identity, face, body proportions, pose, and background.",
  "Keep the garment's colour, pattern, embroidery, cut, and silhouette.",
  "Do not add text, logos, watermarks, or extra people.",
  "Return one photorealistic image.",
].join(" ");

const PLACEHOLDER_KEY = "MY_GEMINI_API_KEY";

const usage = () => {
  console.log(`Usage:
  npm run trial:gemini-try-on -- --person <photo> --garment <image>
  node scripts/trial-gemini-try-on.mjs --person <photo> --garment <image>
  node scripts/trial-gemini-try-on.mjs --dry-run --person <photo> --garment <image>

--design is an alias for --garment. Two positional paths are person, then garment.

Reads GEMINI_API_KEY from the environment, or from gitignored .env.local / .env.
Writes images to scripts/trial-gemini-try-on-out/.
Does not print the API key.
`);
};

const parseArgs = (argv) => {
  const args = { person: "", garment: "", help: false, dryRun: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--person" || arg === "--garment" || arg === "--design") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        console.error(`Missing value for ${arg}`);
        return null;
      }
      index += 1;
      if (arg === "--person") args.person = value;
      else args.garment = value;
    } else if (arg.startsWith("--person=")) {
      args.person = arg.slice("--person=".length);
    } else if (arg.startsWith("--garment=")) {
      args.garment = arg.slice("--garment=".length);
    } else if (arg.startsWith("--design=")) {
      args.garment = arg.slice("--design=".length);
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      return null;
    } else {
      positional.push(arg);
    }
  }
  if (!args.person && positional[0]) args.person = positional[0];
  if (!args.garment && positional[1]) args.garment = positional[1];
  return args;
};

const mimeFor = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return null;
};

const extForMime = (mime) => {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/png") return "png";
  return "bin";
};

const apiKey = () => {
  const value = process.env.GEMINI_API_KEY;
  if (!value || value === PLACEHOLDER_KEY) return "";
  return value;
};

const redact = (value, secret) => {
  const source =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message || String(value)
        : String(value ?? "");
  let text = source;
  if (secret) text = text.split(secret).join("[redacted]");
  return text
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, "[redacted]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key["'\s:=]+)[^\s"',}]+/gi, "$1[redacted]")
    .replace(/[A-Za-z0-9+/]{80,}={0,2}/g, "[redacted-blob]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
};

const summarizeError = (error, secret) => {
  const raw = error instanceof Error ? error.message || String(error) : String(error ?? "Unknown error");
  let summary = raw;
  try {
    const parsed = JSON.parse(raw);
    const apiError = parsed?.error;
    if (apiError && typeof apiError.message === "string") {
      const code = apiError.code != null ? `${apiError.code} ` : "";
      const status = apiError.status ? ` [${apiError.status}]` : "";
      summary = `${code}${apiError.message}${status}`;
    }
  } catch {
    summary = raw;
  }
  return redact(summary, secret);
};

const readImage = (label, filePath) => {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label} image not found: ${filePath}`);
  }
  const mimeType = mimeFor(resolved);
  if (!mimeType) {
    throw new Error(`${label} image must be jpg, png, webp, or gif: ${filePath}`);
  }
  const bytes = fs.readFileSync(resolved);
  return {
    mimeType,
    data: bytes.toString("base64"),
    bytes: bytes.length,
    displayPath: path.relative(root, resolved) || resolved,
  };
};

const safeModelSlug = (model) => model.replace(/[^a-z0-9.-]+/gi, "_");

const imageParts = (response) => {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const parts = candidates.flatMap((candidate) =>
    Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [],
  );
  return {
    images: parts.filter((part) => part?.inlineData?.data),
    texts: parts
      .map((part) => (typeof part?.text === "string" ? part.text.trim() : ""))
      .filter(Boolean),
    finishReason: candidates[0]?.finishReason || "",
    blockReason: response?.promptFeedback?.blockReason || "",
  };
};

const trialModel = async (ai, model, person, garment, secret) => {
  const started = Date.now();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        { text: TRY_ON_PROMPT },
        { inlineData: { mimeType: person.mimeType, data: person.data } },
        { inlineData: { mimeType: garment.mimeType, data: garment.data } },
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });
    const latencyMs = Date.now() - started;
    const { images, texts, finishReason, blockReason } = imageParts(response);
    if (images.length === 0) {
      const detail = [finishReason && `finish=${finishReason}`, blockReason && `block=${blockReason}`]
        .filter(Boolean)
        .join(" ");
      const note = texts[0] ? ` text=${texts[0].slice(0, 160)}` : "";
      return {
        model,
        ok: false,
        latencyMs,
        error: `No image in response${detail ? ` (${detail})` : ""}.${note}`.trim(),
      };
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const files = images.map((part, index) => {
      const mime = part.inlineData.mimeType || "image/png";
      const suffix = images.length > 1 ? `-${index + 1}` : "";
      const filename = `${safeModelSlug(model)}-${stamp}${suffix}.${extForMime(mime)}`;
      const outPath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, "base64"));
      return path.relative(root, outPath);
    });
    return {
      model,
      ok: true,
      latencyMs,
      files,
      text: texts[0] ? texts[0].slice(0, 180) : "",
    };
  } catch (error) {
    return {
      model,
      ok: false,
      latencyMs: Date.now() - started,
      error: summarizeError(error, secret),
    };
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    usage();
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    usage();
    return;
  }
  if (!args.person || !args.garment) {
    usage();
    console.error("Both --person and --garment image paths are required.");
    process.exitCode = 2;
    return;
  }

  const secret = apiKey();
  let person;
  let garment;
  try {
    person = readImage("Person", args.person);
    garment = readImage("Garment", args.garment);
  } catch (error) {
    console.error(redact(error, secret));
    process.exitCode = 2;
    return;
  }

  console.log("Gemini virtual try-on trial");
  console.log(`Person:  ${person.displayPath} (${person.bytes} bytes, ${person.mimeType})`);
  console.log(`Garment: ${garment.displayPath} (${garment.bytes} bytes, ${garment.mimeType})`);
  console.log(`Output:  ${path.relative(root, OUTPUT_DIR)}/`);
  console.log(`API key: ${secret ? "set" : "missing"}`);
  console.log("");

  if (args.dryRun) {
    console.log("Dry run. Gemini was not called.");
    for (const model of MODELS) console.log(`Would run ${model}`);
    return;
  }

  if (!secret) {
    console.error(
      "GEMINI_API_KEY is not set. Add it to the environment or a gitignored .env / .env.local file.",
    );
    process.exitCode = 1;
    return;
  }

  const ai = new GoogleGenAI({ apiKey: secret, vertexai: false });
  let failures = 0;
  for (const model of MODELS) {
    console.log(`Running ${model}...`);
    const result = await trialModel(ai, model, person, garment, secret);
    if (result.ok) {
      console.log(`SUCCESS  ${result.model}  ${result.latencyMs}ms`);
      for (const file of result.files) console.log(`         wrote ${file}`);
      if (result.text) console.log(`         note: ${redact(result.text, secret)}`);
    } else {
      failures += 1;
      console.log(`FAILURE  ${result.model}  ${result.latencyMs}ms`);
      console.log(`         ${result.error}`);
    }
    console.log("");
  }
  if (failures > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(redact(error, apiKey()));
  process.exitCode = 1;
});
