// Local Fabric Naming Engine

// Premium Word Libraries
const COLORS = [
  { name: "Emerald", hex: "#50C878", r: 80, g: 200, b: 120 },
  { name: "Royal", hex: "#4169E1", r: 65, g: 105, b: 225 },
  { name: "Sapphire", hex: "#0F52BA", r: 15, g: 82, b: 186 },
  { name: "Golden", hex: "#FFD700", r: 255, g: 215, b: 0 },
  { name: "Midnight", hex: "#191970", r: 25, g: 25, b: 112 },
  { name: "Sunset", hex: "#FD5E53", r: 253, g: 94, b: 83 },
  { name: "Forest", hex: "#228B22", r: 34, g: 139, b: 34 },
  { name: "Crimson", hex: "#DC143C", r: 220, g: 20, b: 60 },
  { name: "Indigo", hex: "#4B0082", r: 75, g: 0, b: 130 },
  { name: "Ivory", hex: "#FFFFF0", r: 255, g: 255, b: 240 },
  { name: "Burgundy", hex: "#800020", r: 128, g: 0, b: 32 },
  { name: "Ruby", hex: "#E0115F", r: 224, g: 17, b: 95 },
  { name: "Onyx", hex: "#353839", r: 53, g: 56, b: 57 },
  { name: "Amber", hex: "#FFBF00", r: 255, g: 191, b: 0 }
];

const DESCRIPTORS = [
  "Heritage",
  "Prestige",
  "Classic",
  "Luxury",
  "Regal",
  "Signature",
  "Supreme",
  "Noble",
  "Elite",
  "Prime",
  "Imperial",
  "Majestic"
];

const PATTERNS = [
  "Weave",
  "Mosaic",
  "Grid",
  "Lattice",
  "Harmony",
  "Matrix",
  "Diamond",
  "Waves",
  "Crest",
  "Unity",
  "Star",
  "Leaf",
  "Swirl",
  "Crown",
  "Shield"
];

// Helper to calculate color distance
const getColorDistance = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => {
  return Math.sqrt(Math.pow(r2 - r1, 2) + Math.pow(g2 - g1, 2) + Math.pow(b2 - b1, 2));
};

// Deterministic random number generator based on a seed
const mulberry32 = (a: number) => {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
};

// Calculate a simple hash of image data to use as a seed for pattern determination
const hashImageData = (data: Uint8ClampedArray): number => {
  let hash = 0;
  // Sample a subset of pixels for performance
  for (let i = 0; i < data.length; i += 400) {
    hash = ((hash << 5) - hash) + data[i];
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

interface NamingResult {
  suggestions: string[];
  category: string;
}

export const generateLocalFabricNames = async (
  imageBase64OrUrl: string, 
  previousSuggestions: string[] = []
): Promise<NamingResult> => {
  return new Promise((resolve) => {
    // If it's not a valid string or empty, provide defaults
    if (!imageBase64OrUrl) {
      resolve({
        suggestions: ["Royal Heritage Weave", "Elite Indigo Lattice", "Classic Golden Matrix"],
        category: "HiTarget Ankara"
      });
      return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";
    
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        // Resize for faster processing
        const MAX_SIZE = 100;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        if (!ctx) throw new Error("No context");
        
        ctx.drawImage(img, 0, 0, width, height);
        
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        const colorCounts = new Array(COLORS.length).fill(0);
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const a = data[i+3];
          
          if (a > 128) { // Ignore transparent pixels
            let minDistance = Infinity;
            let closestIndex = 0;
            
            for (let c = 0; c < COLORS.length; c++) {
              const color = COLORS[c];
              const dist = getColorDistance(r, g, b, color.r, color.g, color.b);
              if (dist < minDistance) {
                minDistance = dist;
                closestIndex = c;
              }
            }
            
            colorCounts[closestIndex]++;
          }
        }
        
        let maxCount = 0;
        let dominantColorIndex = 0;
        for (let c = 0; c < colorCounts.length; c++) {
          if (colorCounts[c] > maxCount) {
            maxCount = colorCounts[c];
            dominantColorIndex = c;
          }
        }
        
        if (maxCount === 0) throw new Error("No opaque pixels");
        
        const dominantColor = COLORS[dominantColorIndex].name;
        
        // Use image hash for deterministic pattern and descriptor selection
        const imageHash = hashImageData(data);
        
        // Add current time or random offset to the hash based on previous suggestions length
        // This ensures Regenerate (which passes previous suggestions) yields new results
        const seed = imageHash + previousSuggestions.length * 9973; 
        const random = mulberry32(seed);
        
        // Deterministically select category
        const categories = ["HiTarget Ankara", "Hollandis Ankara", "Kampala", "Aso-Oke", "Adire", "Isiagu (Akwa-Oche)", "Lace"];
        const category = categories[Math.floor(random() * categories.length)];
        
        const suggestions: string[] = [];
        
        // Generate exactly 3 unique suggestions
        let attempts = 0;
        while (suggestions.length < 3 && attempts < 100) {
          attempts++;
          const descriptor = DESCRIPTORS[Math.floor(random() * DESCRIPTORS.length)];
          const pattern = PATTERNS[Math.floor(random() * PATTERNS.length)];
          
          // Generate combination: Color Descriptor Pattern or Descriptor Color Pattern
          const format = random() > 0.5 ? 0 : 1;
          let name = "";
          
          if (format === 0) {
            name = `${dominantColor} ${descriptor} ${pattern}`;
          } else {
            name = `${descriptor} ${dominantColor} ${pattern}`;
          }
          
          if (!suggestions.includes(name) && !previousSuggestions.includes(name)) {
            suggestions.push(name);
          }
        }
        
        // Fallback if we couldn't generate 3 unique
        if (suggestions.length < 3) {
           suggestions.push(`Premium ${dominantColor} Blend ${Date.now() % 1000}`);
           if (suggestions.length < 3) suggestions.push(`Exclusive ${dominantColor} Craft ${Date.now() % 1000}`);
           if (suggestions.length < 3) suggestions.push(`Signature ${dominantColor} Weave ${Date.now() % 1000}`);
        }
        
        resolve({
          suggestions,
          category
        });
      } catch (e) {
        // Fallback on error
        resolve({
          suggestions: ["Royal Indigo Weave", "Elite Emerald Lattice", "Classic Sunset Matrix"],
          category: "HiTarget Ankara"
        });
      }
    };
    
    img.onerror = () => {
      // Fallback on error
      resolve({
        suggestions: ["Royal Crimson Weave", "Elite Onyx Lattice", "Classic Ivory Matrix"],
        category: "HiTarget Ankara"
      });
    };
    
    img.src = imageBase64OrUrl;
  });
};
