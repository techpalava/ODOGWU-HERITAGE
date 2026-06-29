export const compressImage = (
  dataURL: string,
  maxSize: number = 800,
): Promise<string> => {
  return new Promise((resolve) => {
    // If it's an SVG, don't compress, just return it as it's already vector
    if (dataURL.startsWith("data:image/svg+xml")) {
      resolve(dataURL);
      return;
    }

    const img = new globalThis.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      // Only resize if it's exceptionally large
      if (width > height) {
        if (width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Clear rect with transparent background (in case of PNG/WebP)
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        // Use webp for better compression while preserving transparency
        resolve(canvas.toDataURL("image/webp", 0.6));
      } else {
        resolve(dataURL);
      }
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
};
