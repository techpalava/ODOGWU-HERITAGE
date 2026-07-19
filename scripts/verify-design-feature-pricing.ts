const FEATURE_PRICE = 12;

type TestStyle = {
  name: string;
  description?: string;
  options?: string[];
  includedDesignFeatures?: {
    hasMonogram?: boolean;
    hasEmbroidery?: boolean;
    hasMonogramTrimming?: boolean;
  };
};

function getBuiltInDesignFeatures(style: TestStyle) {
  const text = [
    style.name,
    style.description,
    ...(style.options || []),
  ]
    .join(" ")
    .toLowerCase();

  return {
    hasMonogram:
      style.includedDesignFeatures?.hasMonogram === true ||
      /\bmonogram\b/.test(text),
    hasEmbroidery:
      style.includedDesignFeatures?.hasEmbroidery === true ||
      /embroider|embroid/.test(text),
    hasMonogramTrimming:
      style.includedDesignFeatures?.hasMonogramTrimming === true ||
      /monogram trim|monogram trimming/.test(text),
  };
}

function calculateAutomaticDesignFeaturePrice(style: TestStyle) {
  const features = getBuiltInDesignFeatures(style);

  return (
    (features.hasMonogram ? FEATURE_PRICE : 0) +
    (features.hasEmbroidery ? FEATURE_PRICE : 0) +
    (features.hasMonogramTrimming ? FEATURE_PRICE : 0)
  );
}

function assertEqual(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    throw new Error(`${label}: expected €${expected}, got €${actual}`);
  }

  console.log(`PASS: ${label}`);
}

assertEqual(
  "Plain style adds no automatic custom detail price",
  calculateAutomaticDesignFeaturePrice({
    name: "Classic Kaftan",
    description: "Clean minimal kaftan style.",
  }),
  0,
);

assertEqual(
  "Embroidery style automatically adds €12",
  calculateAutomaticDesignFeaturePrice({
    name: "Royal Senator",
    description: "Design contains premium embroidery on the chest.",
  }),
  12,
);

assertEqual(
  "Monogram style automatically adds €12",
  calculateAutomaticDesignFeaturePrice({
    name: "Prestige Monogram Kaftan",
  }),
  12,
);

assertEqual(
  "Style with monogram and embroidery automatically adds €24",
  calculateAutomaticDesignFeaturePrice({
    name: "Executive Monogram Senator",
    description: "Includes embroidery detailing.",
  }),
  24,
);

assertEqual(
  "Explicit metadata works even without text keywords",
  calculateAutomaticDesignFeaturePrice({
    name: "Heritage Special",
    includedDesignFeatures: {
      hasMonogram: true,
      hasEmbroidery: true,
    },
  }),
  24,
);

console.log("Automatic design feature pricing verification passed.");
