export function getClosestColorName(hex: string): string {
  const colors = [
    { name: "Orange", hex: "#FFA500" },
    { name: "Royal Blue", hex: "#4169E1" },
    { name: "Emerald Green", hex: "#50C878" },
    { name: "Burgundy", hex: "#800020" },
    { name: "Black", hex: "#000000" },
    { name: "White", hex: "#FFFFFF" },
    { name: "Gold", hex: "#FFD700" },
    { name: "Brown", hex: "#A52A2A" },
    { name: "Purple", hex: "#800080" },
    { name: "Red", hex: "#FF0000" },
    { name: "Teal", hex: "#008080" },
    { name: "Pink", hex: "#FFC0CB" },
    { name: "Navy", hex: "#000080" },
    { name: "Yellow", hex: "#FFFF00" },
    { name: "Grey", hex: "#808080" },
    { name: "Indigo", hex: "#4B0082" }
  ];

  const hexToRgb = (h: string) => {
    let r = 0, g = 0, b = 0;
    if (h.length === 4) {
      r = parseInt(h[1] + h[1], 16);
      g = parseInt(h[2] + h[2], 16);
      b = parseInt(h[3] + h[3], 16);
    } else if (h.length === 7) {
      r = parseInt(h.substring(1, 3), 16);
      g = parseInt(h.substring(3, 5), 16);
      b = parseInt(h.substring(5, 7), 16);
    }
    return { r, g, b };
  };

  const target = hexToRgb(hex);

  let closest = colors[0];
  let minDistance = Infinity;

  for (const color of colors) {
    const c = hexToRgb(color.hex);
    const distance = Math.pow(c.r - target.r, 2) + Math.pow(c.g - target.g, 2) + Math.pow(c.b - target.b, 2);
    if (distance < minDistance) {
      minDistance = distance;
      closest = color;
    }
  }

  return closest.name;
}
