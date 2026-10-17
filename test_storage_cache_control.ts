import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STORAGE_IMMUTABLE_CACHE_CONTROL,
  STORAGE_REUSED_PATH_CACHE_CONTROL,
} from "./src/utils/storageCacheControl";

assert.equal(STORAGE_IMMUTABLE_CACHE_CONTROL, "public, max-age=31536000, immutable");
assert.equal(STORAGE_REUSED_PATH_CACHE_CONTROL, "public, max-age=86400");

// Admin catalogue uploads use content-unique paths and set the long cache.
const imageService = readFileSync("src/services/imageService.ts", "utf8");
assert.match(imageService, /const filename = `\$\{pathPrefix\}\/\$\{id\}\.\$\{extension\}`;/);
assert.match(imageService, /cacheControl: STORAGE_IMMUTABLE_CACHE_CONTROL/);

const mediaRepository = readFileSync("src/repositories/MediaRepository.ts", "utf8");
assert.match(mediaRepository, /const timestamp = Date\.now\(\);/);
assert.doesNotMatch(
  mediaRepository,
  /uploadString\(storageRef, base64Data, 'data_url'\);/,
  "MediaRepository uploads must pass cache metadata",
);
assert.match(mediaRepository, /cacheControl: STORAGE_IMMUTABLE_CACHE_CONTROL/);

console.log("PASS: storage upload cache-control");
