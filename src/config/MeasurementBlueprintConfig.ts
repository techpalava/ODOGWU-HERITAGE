import type {
  CustomDetailDemographic,
  FabricGarmentType,
  MeasurementRiskRoute,
} from "../types";

export const MEASUREMENT_BLUEPRINT_VERSION =
  "measurements-steps-website-v1@8b59ab07" as const;
export const MEASUREMENT_FORMULA_VERSION = "height-average-factor-v1" as const;
export const MEASUREMENT_SOURCE_SHA256 =
  "8B59AB078BDA1A7376CA3A6A77AA24CC3AFA760CCCD0B037C163A886FA919DF7" as const;

/** Source-only provenance. Runtime route selection uses the typed markers below. */
export const MEASUREMENT_ROUTE_MARKER_STYLE = {
  conditionalFormattingRange: "G13:H405",
  rule: "containsText:Yes, Provide",
  fillArgb: "FF66FFCC",
  mediumRiskColumn: "G",
  highRiskColumn: "H",
} as const;

export type MeasurementProfileId =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G"
  | "H" | "I" | "J" | "K" | "L" | "M";

export type CanonicalMeasurementId =
  | "head_circumference"
  | "neck_circumference"
  | "shoulder_length"
  | "shirt_length_standard"
  | "shirt_length_long"
  | "dress_length_standard"
  | "dress_length_long"
  | "sleeve_length_sleeveless"
  | "sleeve_length_short"
  | "sleeve_length_mid"
  | "sleeve_length_long"
  | "wrist_circumference"
  | "chest_bust_circumference"
  | "belly_circumference"
  | "bicep_circumference"
  | "elbow_circumference"
  | "armhole_circumference"
  | "total_height"
  | "height_head_to_lower_neck"
  | "height_lower_neck_to_waist"
  | "height_waist_to_feet"
  | "under_bust_circumference"
  | "hip_circumference"
  | "square_neck_length"
  | "square_neck_width"
  | "shoulder_to_under_bust_length"
  | "waist_circumference"
  | "thigh_circumference"
  | "knee_circumference"
  | "ankle_circumference"
  | "waist_to_hip_length"
  | "waist_to_crotch_depth_length"
  | "waist_to_knee_length"
  | "waist_to_ankle_length"
  | "waist_to_feet_side_length"
  | "waist_to_feet_back_length"
  | "waist_to_lap_length"
  | "skirt_bottom_circumference";

export type MeasurementKind =
  | "circumference"
  | "vertical_length"
  | "horizontal_length"
  | "total_height"
  | "finished_garment_preference";

export interface MeasurementDefinition {
  id: CanonicalMeasurementId;
  sourceLabel: string;
  customerLabel: string;
  kind: MeasurementKind;
  scope: "shared_body" | "garment";
  unitCompatibility: readonly ["inch", "cm"];
  futureCalculationBasis?: "height";
  instructions?: string;
}

export interface MeasurementRowFactors {
  averageFactor: number;
  minFactor: number;
  maxFactor: number;
  stdFactor: number;
}

export interface MeasurementProfileField {
  sourceRow: number;
  measurementId: CanonicalMeasurementId;
  directRoutes: readonly MeasurementRiskRoute[];
  averageFactor: number | null;
  minFactor: number | null;
  maxFactor: number | null;
  stdFactor: number | null;
  factorStatus: "present" | "missing";
  conditionalRule?: "square_neck_option" | "applicability_unresolved";
  alternativeGroup?: string;
}

export interface MeasurementProfile {
  id: MeasurementProfileId;
  title: string;
  sourceTitle: string;
  sourceHeaderRow: number;
  garmentType: FabricGarmentType;
  demographics: readonly CustomDetailDemographic[];
  constructionOptionIds: readonly string[];
  fields: readonly MeasurementProfileField[];
  alternativeSelectionByConstructionId?: Readonly<
    Record<string, CanonicalMeasurementId>
  >;
}

const units = ["inch", "cm"] as const;
const definition = (
  id: CanonicalMeasurementId,
  sourceLabel: string,
  customerLabel: string,
  kind: MeasurementKind,
  scope: MeasurementDefinition["scope"] = "shared_body",
  instructions?: string,
): MeasurementDefinition => ({
  id,
  sourceLabel,
  customerLabel,
  kind,
  scope,
  unitCompatibility: units,
  ...(instructions ? { instructions } : {}),
});

export const MEASUREMENT_DEFINITIONS: readonly MeasurementDefinition[] = [
  definition("head_circumference", "Head Circumference", "Head Circumference", "circumference"),
  definition("neck_circumference", "Neck Circumference", "Neck Circumference", "circumference"),
  definition("shoulder_length", "Shoulder Length", "Shoulder Width", "horizontal_length"),
  definition("shirt_length_standard", "Shirt Length (Standard)", "Standard Shirt Length", "finished_garment_preference", "garment", "Measure to crotch level or just below."),
  definition("shirt_length_long", "Shirt Length (Long)", "Long Shirt Length", "finished_garment_preference", "garment"),
  definition("dress_length_standard", "Dress Length (Standard)", "Standard Dress Length", "finished_garment_preference", "garment"),
  definition("dress_length_long", "Dress Length (Long)", "Long Dress Length", "finished_garment_preference", "garment"),
  definition("sleeve_length_sleeveless", "SLEEVELESS Sleeve Length, Or", "Sleeveless Finish Length", "finished_garment_preference", "garment"),
  definition("sleeve_length_short", "SHORT Sleeve Length", "Short Sleeve Length", "vertical_length", "garment"),
  definition("sleeve_length_mid", "MID Sleeve Length, Or", "Mid Sleeve Length", "vertical_length", "garment"),
  definition("sleeve_length_long", "LONG Sleeve Length", "Long Sleeve Length", "vertical_length", "garment"),
  definition("wrist_circumference", "WRIST Circumference", "Wrist Circumference", "circumference"),
  definition("chest_bust_circumference", "Chest (Borst) Circumference", "Chest/Bust Circumference", "circumference"),
  definition("belly_circumference", "Tommy (Belly Area) Circumference", "Belly Circumference", "circumference"),
  definition("bicep_circumference", "Bicep Circumference (Center Between Shoulder and Elbow)", "Bicep Circumference", "circumference"),
  definition("elbow_circumference", "Elbow Circumference", "Elbow Circumference", "circumference"),
  definition("armhole_circumference", "Arm Hole Circumference (Around Arm-pit)", "Armhole Circumference", "circumference"),
  {
    ...definition("total_height", "Height (Total Height)", "Total Height", "total_height"),
    futureCalculationBasis: "height",
  },
  definition("height_head_to_lower_neck", "Height Length 1: Head Top to Lower Neck (Measure from backside)", "Head Top to Lower Neck", "vertical_length"),
  definition("height_lower_neck_to_waist", "Height Length 2: Lower Neck to Waist (Measure from backside)", "Lower Neck to Waist", "vertical_length"),
  definition("height_waist_to_feet", "Height Length 3: Waist to Feet (Just Below Ankle)", "Waist to Feet", "vertical_length"),
  definition("under_bust_circumference", "Under Borst Circumference", "Under-bust Circumference", "circumference"),
  definition("hip_circumference", "Hip Circumference", "Hip Circumference", "circumference"),
  definition("square_neck_length", "Square Shaped Neck Design - Length (Mid-Shoulder to Borst)", "Square-neck Length", "finished_garment_preference", "garment"),
  definition("square_neck_width", "Square Shaped Neck Design - Width (Mid-Shoulder to Shoulder)", "Square-neck Width", "finished_garment_preference", "garment"),
  definition("shoulder_to_under_bust_length", "Shoulder to Under-Borst - Length (for Tight design under Borst", "Shoulder to Under-bust Length", "vertical_length", "garment"),
  definition("waist_circumference", "Waist Circumference", "Waist Circumference", "circumference"),
  definition("thigh_circumference", "Thigh Circumference", "Thigh Circumference", "circumference"),
  definition("knee_circumference", "Knee Circumference", "Knee Circumference", "circumference"),
  definition("ankle_circumference", "Ankle Circumference", "Ankle Circumference", "circumference"),
  definition("waist_to_hip_length", "Waist-to-Hip Length", "Waist-to-Hip Length", "vertical_length"),
  definition("waist_to_crotch_depth_length", "Waist-to-Crotch-Depth Length", "Waist-to-Crotch Depth", "vertical_length"),
  definition("waist_to_knee_length", "Waist-to-KNEE (Or Just ABOVE KNEE) Length", "Waist-to-Knee Length", "finished_garment_preference", "garment"),
  definition("waist_to_ankle_length", "Waist-to-ANKLE Length", "Waist-to-Ankle Length", "finished_garment_preference", "garment"),
  definition("waist_to_feet_side_length", "Waist-to-Feet (Bodyside, Without Shoes)", "Waist-to-Feet Side Length", "vertical_length", "garment"),
  definition("waist_to_feet_back_length", "Waist-to-FEET (Backside along Buttocks, Without Shoes)", "Waist-to-Feet Back Length", "vertical_length", "garment"),
  definition("waist_to_lap_length", "Waist-to-LAP or THIGH Length", "Waist-to-Lap Length", "finished_garment_preference", "garment"),
  definition("skirt_bottom_circumference", "BOTTOM Circumference of Skirt (How Wide Should Skirt End Be)", "Skirt Bottom Circumference", "finished_garment_preference", "garment"),
] as const;

type SourceTuple = readonly [
  sourceRow: number,
  measurementId: CanonicalMeasurementId,
  routeMask: number,
  factors: MeasurementRowFactors | null,
  conditional?: boolean,
];

const factor = (
  averageFactor: number,
  minFactor: number,
  maxFactor: number,
  stdFactor: number,
): MeasurementRowFactors => ({
  averageFactor,
  minFactor,
  maxFactor,
  stdFactor,
});

/** Workbook row factors. Attach per profile row; never look these up by measurement name alone. */
const HEAD = factor(0.343366501291449, 0.302054054054054, 0.401544117647059, 0.0216177935993685);
const NECK = factor(0.237512850768436, 0.204367816091954, 0.261257142857143, 0.0161611252400674);
const SHOULDER = factor(0.256919376750829, 0.233405405405405, 0.291954022988506, 0.0172764050536959);
const CHEST = factor(0.571563968173318, 0.466911764705882, 0.693390804597701, 0.0661713886575747);
const TOMMY = factor(0.508358355805672, 0.189802197802198, 0.686091954022989, 0.110452608149807);
const BICEP = factor(0.199866829871064, 0.157891891891892, 0.328705882352941, 0.0405735955602765);
const ELBOW = factor(0.172224034723017, 0.146242424242424, 0.194829545454545, 0.0161390518098091);
const ARMHOLE = factor(0.295422123205804, 0.247135135135135, 0.343318681318681, 0.0265752264684223);
const SHORT_SLEEVE = factor(0.140482628872026, 0.102183908045977, 0.15608938547486, 0.0139349674052043);
const LONG_SLEEVE = factor(0.3468546540286, 0.321067415730337, 0.372241379310345, 0.0117596136159499);
const WRIST = factor(0.126960814185041, 0.111365079365079, 0.149411764705882, 0.00912864685417029);
const STANDARD_SHIRT_DRESS_LENGTH = factor(0.44789871685868, 0.354852941176471, 0.627701149425287, 0.0521377686773065);
const LONG_SHIRT_LENGTH = factor(0.597092331523786, 0.56530487804878, 0.627701149425287, 0.0204097518886524);
const HEIGHT = factor(1, 1, 1, 0);
const HEIGHT_LENGTH_1 = factor(0.151682300586608, 0.13867816091954, 0.168088235294118, 0.00727690847329009);
const HEIGHT_LENGTH_2 = factor(0.287574416786155, 0.239058823529412, 0.329513513513514, 0.0256685341360666);
const HEIGHT_LENGTH_3 = factor(0.563300135815008, 0.514864864864865, 0.605804597701149, 0.0238566021264106);
const WAIST = factor(0.512617442081532, 0.421686746987952, 0.627865168539326, 0.0601700276003539);
const LOWER_BODY_HIP = factor(0.584591437335114, 0.513602941176471, 0.637791208791209, 0.043370663346314);
const THIGH = factor(0.34412223085074, 0.298823529411765, 0.397747252747253, 0.0356971563378461);
const KNEE = factor(0.242042112706051, 0.205945945945946, 0.279120879120879, 0.0250665101464549);
const ANKLE = factor(0.198771501312092, 0.131736526946108, 0.245340909090909, 0.0364754109987181);
const WAIST_TO_HIP = factor(0.0897214528042889, 0.0747058823529412, 0.109837837837838, 0.0116466601853131);
const WAIST_TO_CROTCH = factor(0.131833343719864, 0.121397058823529, 0.145142857142857, 0.00752939237990657);
const PANTS_SHORTS_WAIST_TO_KNEE = factor(0.289493733847171, 0.254, 0.323353293413173, 0.0217034313693665);
const STANDARD_SKIRT_WAIST_TO_KNEE = factor(0.242042112706051, 0.205945945945946, 0.279120879120879, 0.0250665101464549);
const PANTS_WAIST_TO_ANKLE = factor(0.535919333317358, 0.481987951807229, 0.562874251497006, 0.0245571761192079);
const PANTS_WAIST_TO_FEET_SIDE = factor(0.561814572654843, 0.528594594594595, 0.598802395209581, 0.020152518065034);

const routesFromMask = (mask: number): MeasurementRiskRoute[] => [
  ...(mask & 1 ? ["low_risk" as const] : []),
  ...(mask & 2 ? ["medium_risk" as const] : []),
  ...(mask & 4 ? ["high_risk" as const] : []),
];

const profileFields = (
  profileId: MeasurementProfileId,
  tuples: readonly SourceTuple[],
): MeasurementProfileField[] => tuples.map(([sourceRow, measurementId, routeMask, factors, conditional]) => ({
  sourceRow,
  measurementId,
  directRoutes: routesFromMask(routeMask),
  averageFactor: factors?.averageFactor ?? null,
  minFactor: factors?.minFactor ?? null,
  maxFactor: factors?.maxFactor ?? null,
  stdFactor: factors?.stdFactor ?? null,
  factorStatus: factors ? "present" as const : "missing",
  ...(conditional
    ? {
        conditionalRule:
          measurementId === "square_neck_length" || measurementId === "square_neck_width"
            ? "square_neck_option" as const
            : "applicability_unresolved" as const,
      }
    : {}),
  ...(["B", "D", "F", "H"].includes(profileId) &&
  (measurementId === "sleeve_length_mid" || measurementId === "sleeve_length_long")
    ? { alternativeGroup: `${profileId}_sleeve_length` }
    : {}),
  ...(profileId === "E" && (measurementId === "sleeve_length_sleeveless" || measurementId === "sleeve_length_short")
    ? { alternativeGroup: "E_sleeve_length" }
    : {}),
  ...(profileId === "G" && (measurementId === "sleeve_length_sleeveless" || measurementId === "sleeve_length_short")
    ? { alternativeGroup: "G_sleeve_length" }
    : {}),
}));

const PROFILE_ROWS: Readonly<Record<MeasurementProfileId, readonly SourceTuple[]>> = {
  A: [
    [15, "head_circumference", 1, HEAD],
    [16, "neck_circumference", 1, NECK],
    [17, "shoulder_length", 3, SHOULDER],
    [18, "shirt_length_standard", 1, STANDARD_SHIRT_DRESS_LENGTH],
    [19, "sleeve_length_short", 1, SHORT_SLEEVE],
    [20, "chest_bust_circumference", 7, CHEST],
    [21, "belly_circumference", 7, TOMMY],
    [22, "bicep_circumference", 1, BICEP],
    [23, "elbow_circumference", 1, ELBOW],
    [24, "armhole_circumference", 3, ARMHOLE],
    [25, "total_height", 7, HEIGHT],
    [27, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [28, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [29, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
  ],
  B: [
    [33, "head_circumference", 1, HEAD],
    [34, "neck_circumference", 1, NECK],
    [35, "shoulder_length", 3, SHOULDER],
    [36, "shirt_length_standard", 1, STANDARD_SHIRT_DRESS_LENGTH],
    [37, "sleeve_length_mid", 1, null],
    [38, "sleeve_length_long", 1, LONG_SLEEVE],
    [39, "chest_bust_circumference", 7, CHEST],
    [40, "belly_circumference", 7, TOMMY],
    [41, "bicep_circumference", 1, BICEP],
    [42, "elbow_circumference", 1, ELBOW],
    [43, "armhole_circumference", 3, ARMHOLE],
    [44, "total_height", 7, HEIGHT],
    [46, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [47, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [48, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
  ],
  C: [
    [52, "head_circumference", 1, HEAD],
    [53, "neck_circumference", 1, NECK],
    [54, "shoulder_length", 3, SHOULDER],
    [55, "shirt_length_long", 1, LONG_SHIRT_LENGTH],
    [56, "sleeve_length_short", 1, SHORT_SLEEVE],
    [57, "wrist_circumference", 7, WRIST],
    [58, "chest_bust_circumference", 7, CHEST],
    [59, "belly_circumference", 7, TOMMY],
    [60, "bicep_circumference", 1, BICEP],
    [61, "elbow_circumference", 1, ELBOW],
    [62, "armhole_circumference", 3, ARMHOLE],
    [63, "total_height", 7, HEIGHT],
    [65, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [66, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [67, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
  ],
  D: [
    [71, "head_circumference", 1, HEAD],
    [72, "neck_circumference", 1, NECK],
    [73, "shoulder_length", 3, SHOULDER],
    [74, "shirt_length_long", 1, LONG_SHIRT_LENGTH],
    [75, "sleeve_length_mid", 1, null],
    [76, "sleeve_length_long", 1, LONG_SLEEVE],
    [77, "wrist_circumference", 7, WRIST],
    [78, "chest_bust_circumference", 7, CHEST],
    [79, "belly_circumference", 7, TOMMY],
    [80, "bicep_circumference", 1, BICEP],
    [81, "elbow_circumference", 1, ELBOW],
    [82, "armhole_circumference", 3, ARMHOLE],
    [83, "total_height", 7, HEIGHT],
    [85, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [86, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [87, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
  ],
  E: [
    [91, "head_circumference", 1, HEAD],
    [92, "neck_circumference", 1, NECK],
    [93, "shoulder_length", 3, SHOULDER],
    [94, "dress_length_standard", 1, STANDARD_SHIRT_DRESS_LENGTH],
    [95, "sleeve_length_sleeveless", 1, null],
    [96, "sleeve_length_short", 1, SHORT_SLEEVE],
    [97, "chest_bust_circumference", 7, CHEST],
    [98, "belly_circumference", 7, TOMMY],
    [99, "bicep_circumference", 1, BICEP],
    [100, "elbow_circumference", 1, ELBOW],
    [101, "armhole_circumference", 3, ARMHOLE],
    [102, "total_height", 7, HEIGHT],
    [104, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [105, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [106, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
    [108, "under_bust_circumference", 1, null, true],
    [109, "hip_circumference", 1, null, true],
    [110, "square_neck_length", 1, null, true],
    [111, "square_neck_width", 1, null, true],
    [112, "shoulder_to_under_bust_length", 1, null, true],
  ],
  F: [
    [116, "head_circumference", 1, HEAD],
    [117, "neck_circumference", 1, NECK],
    [118, "shoulder_length", 3, SHOULDER],
    [119, "dress_length_standard", 1, STANDARD_SHIRT_DRESS_LENGTH],
    [120, "sleeve_length_mid", 1, null],
    [121, "sleeve_length_long", 1, LONG_SLEEVE],
    [122, "chest_bust_circumference", 7, CHEST],
    [123, "belly_circumference", 7, TOMMY],
    [124, "bicep_circumference", 1, BICEP],
    [125, "elbow_circumference", 1, ELBOW],
    [126, "armhole_circumference", 3, ARMHOLE],
    [127, "total_height", 7, HEIGHT],
    [129, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [130, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [131, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
    [133, "under_bust_circumference", 1, null, true],
    [134, "hip_circumference", 1, null, true],
    [135, "square_neck_length", 1, null, true],
    [136, "square_neck_width", 1, null, true],
    [137, "shoulder_to_under_bust_length", 1, null, true],
  ],
  G: [
    [141, "head_circumference", 1, HEAD],
    [142, "neck_circumference", 1, NECK],
    [143, "shoulder_length", 3, SHOULDER],
    [144, "dress_length_long", 1, null],
    [145, "sleeve_length_sleeveless", 1, null],
    [146, "sleeve_length_short", 1, SHORT_SLEEVE],
    [147, "chest_bust_circumference", 7, CHEST],
    [148, "belly_circumference", 7, TOMMY],
    [149, "bicep_circumference", 1, BICEP],
    [150, "elbow_circumference", 1, ELBOW],
    [151, "armhole_circumference", 3, ARMHOLE],
    [152, "total_height", 7, HEIGHT],
    [154, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [155, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [156, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
    [158, "under_bust_circumference", 1, null, true],
    [159, "hip_circumference", 1, null, true],
    [160, "square_neck_length", 1, null, true],
    [161, "square_neck_width", 1, null, true],
    [162, "shoulder_to_under_bust_length", 1, null, true],
  ],
  H: [
    [166, "head_circumference", 1, HEAD],
    [167, "neck_circumference", 1, NECK],
    [168, "shoulder_length", 3, SHOULDER],
    [169, "dress_length_long", 1, null],
    [170, "sleeve_length_mid", 1, null],
    [171, "sleeve_length_long", 1, LONG_SLEEVE],
    [172, "chest_bust_circumference", 7, CHEST],
    [173, "belly_circumference", 7, TOMMY],
    [174, "bicep_circumference", 1, BICEP],
    [175, "elbow_circumference", 1, ELBOW],
    [176, "armhole_circumference", 3, ARMHOLE],
    [177, "total_height", 7, HEIGHT],
    [179, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [180, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [181, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
    [183, "under_bust_circumference", 1, null, true],
    [184, "hip_circumference", 1, null, true],
    [185, "square_neck_length", 1, null, true],
    [186, "square_neck_width", 1, null, true],
    [187, "shoulder_to_under_bust_length", 1, null, true],
  ],
  I: [
    [191, "waist_circumference", 7, WAIST],
    [192, "hip_circumference", 3, LOWER_BODY_HIP],
    [193, "thigh_circumference", 7, THIGH],
    [194, "knee_circumference", 1, KNEE],
    [195, "ankle_circumference", 1, ANKLE],
    [196, "waist_to_hip_length", 1, WAIST_TO_HIP],
    [197, "waist_to_crotch_depth_length", 7, WAIST_TO_CROTCH],
    [198, "waist_to_knee_length", 1, PANTS_SHORTS_WAIST_TO_KNEE],
    [199, "waist_to_ankle_length", 3, PANTS_WAIST_TO_ANKLE],
    [200, "waist_to_feet_side_length", 1, PANTS_WAIST_TO_FEET_SIDE],
    [201, "waist_to_feet_back_length", 3, null],
    [202, "total_height", 7, HEIGHT],
    [204, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [205, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [206, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
  ],
  J: [
    [210, "waist_circumference", 7, WAIST],
    [211, "hip_circumference", 3, LOWER_BODY_HIP],
    [212, "thigh_circumference", 7, THIGH],
    [213, "knee_circumference", 1, KNEE],
    [214, "waist_to_hip_length", 1, WAIST_TO_HIP],
    [215, "waist_to_crotch_depth_length", 3, WAIST_TO_CROTCH],
    [216, "waist_to_knee_length", 7, PANTS_SHORTS_WAIST_TO_KNEE],
    [217, "total_height", 7, HEIGHT],
    [219, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [220, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [221, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
  ],
  K: [
    [225, "waist_circumference", 7, WAIST],
    [226, "hip_circumference", 3, LOWER_BODY_HIP],
    [227, "thigh_circumference", 7, THIGH],
    [228, "knee_circumference", 1, KNEE],
    [229, "waist_to_hip_length", 1, WAIST_TO_HIP],
    [230, "waist_to_crotch_depth_length", 3, WAIST_TO_CROTCH],
    [231, "waist_to_lap_length", 7, null],
    [232, "total_height", 7, HEIGHT],
    [234, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [235, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [236, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
  ],
  L: [
    [240, "waist_circumference", 7, WAIST],
    [241, "hip_circumference", 3, LOWER_BODY_HIP],
    [242, "thigh_circumference", 1, THIGH],
    [243, "waist_to_hip_length", 1, WAIST_TO_HIP],
    [244, "skirt_bottom_circumference", 3, null],
    [245, "waist_to_lap_length", 7, null],
    [246, "waist_to_knee_length", 7, STANDARD_SKIRT_WAIST_TO_KNEE],
    [247, "total_height", 7, HEIGHT],
    [249, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [250, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [251, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
  ],
  M: [
    [255, "waist_circumference", 7, WAIST],
    [256, "hip_circumference", 3, LOWER_BODY_HIP],
    [257, "thigh_circumference", 1, THIGH],
    [258, "waist_to_hip_length", 1, WAIST_TO_HIP],
    [259, "skirt_bottom_circumference", 3, null],
    [260, "waist_to_ankle_length", 7, null],
    [261, "total_height", 7, HEIGHT],
    [263, "height_head_to_lower_neck", 3, HEIGHT_LENGTH_1],
    [264, "height_lower_neck_to_waist", 3, HEIGHT_LENGTH_2],
    [265, "height_waist_to_feet", 3, HEIGHT_LENGTH_3],
  ],
};

const profile = (
  id: MeasurementProfileId,
  title: string,
  sourceTitle: string,
  sourceHeaderRow: number,
  garmentType: FabricGarmentType,
  demographics: readonly CustomDetailDemographic[],
  constructionOptionIds: readonly string[],
  alternativeSelectionByConstructionId?: Readonly<Record<string, CanonicalMeasurementId>>,
): MeasurementProfile => ({
  id,
  title,
  sourceTitle,
  sourceHeaderRow,
  garmentType,
  demographics,
  constructionOptionIds,
  fields: profileFields(id, PROFILE_ROWS[id]),
  ...(alternativeSelectionByConstructionId ? { alternativeSelectionByConstructionId } : {}),
});

const allDemographics = ["male", "female", "unisex"] as const;
const femaleDemographics = ["female", "unisex"] as const;

export const MEASUREMENT_PROFILES: readonly MeasurementProfile[] = [
  profile("A", "Shirt — Standard Length, Short Sleeve", "SHIRT (SL-SS)", 13, "shirt", allDemographics, ["shirt_std_short"]),
  profile("B", "Shirt — Standard Length, Mid or Long Sleeve", "SHIRT (SL-MS or LS)", 31, "shirt", allDemographics, ["shirt_std_midlong"]),
  profile("C", "Shirt — Long Length, Short Sleeve", "SHIRT (LL-SS)", 50, "shirt", allDemographics, ["shirt_long_short"]),
  profile("D", "Shirt — Long Length, Mid or Long Sleeve", "SHIRT (LL-MS or LS)", 69, "shirt", allDemographics, ["shirt_long_midlong"]),
  profile("E", "Dress — Standard Length, Sleeveless or Short Sleeve", "DRESS (SL-SLL or SS)", 89, "dress", femaleDemographics, ["dress_std_sleeveless", "dress_std_short"], { dress_std_sleeveless: "sleeve_length_sleeveless", dress_std_short: "sleeve_length_short" }),
  profile("F", "Dress — Standard Length, Mid or Long Sleeve", "DRESS (SL-MS or LS)", 114, "dress", femaleDemographics, ["dress_std_midlong"]),
  profile("G", "Dress — Long Length, Sleeveless or Short Sleeve", "DRESS (LL-SLL or SS)", 139, "dress", femaleDemographics, ["dress_long_sleeveless", "dress_long_short"], { dress_long_sleeveless: "sleeve_length_sleeveless", dress_long_short: "sleeve_length_short" }),
  profile("H", "Dress — Long Length, Mid or Long Sleeve", "DRESS (LL-MS to LS)", 164, "dress", femaleDemographics, ["dress_long_midlong"]),
  profile("I", "Pants/Trousers", "PANTS (TROUSERS)", 189, "trouser", allDemographics, []),
  profile("J", "Nikka/Standard Shorts", "SHORTS (NIKKA)", 208, "standard_shorts", allDemographics, []),
  profile("K", "Bum Shorts", "BUM SHORTS", 223, "bum_shorts", femaleDemographics, []),
  profile("L", "Standard-Length Skirt", "SKIRTS — STANDARD", 238, "skirt", femaleDemographics, ["skirt_std"]),
  profile("M", "Long Skirt", "SKIRTS — LONG", 253, "skirt", femaleDemographics, ["skirt_long"]),
] as const;

export const EXPECTED_MEASUREMENT_SOURCE_MARKER_COUNTS: Readonly<
  Record<MeasurementProfileId, Readonly<Record<MeasurementRiskRoute, number>>>
> = {
  A: { low_risk: 14, medium_risk: 8, high_risk: 3 },
  B: { low_risk: 15, medium_risk: 8, high_risk: 3 },
  C: { low_risk: 15, medium_risk: 9, high_risk: 4 },
  D: { low_risk: 16, medium_risk: 9, high_risk: 4 },
  E: { low_risk: 20, medium_risk: 8, high_risk: 3 },
  F: { low_risk: 20, medium_risk: 8, high_risk: 3 },
  G: { low_risk: 20, medium_risk: 8, high_risk: 3 },
  H: { low_risk: 20, medium_risk: 8, high_risk: 3 },
  I: { low_risk: 15, medium_risk: 10, high_risk: 4 },
  J: { low_risk: 11, medium_risk: 9, high_risk: 4 },
  K: { low_risk: 11, medium_risk: 9, high_risk: 4 },
  L: { low_risk: 11, medium_risk: 9, high_risk: 4 },
  M: { low_risk: 10, medium_risk: 8, high_risk: 3 },
};

export const SQUARE_NECK_OPTION_IDS = [
  "neck_no_u",
  "neck_vert_u",
  "neck_flat_u",
] as const;

export const DRESS_CONDITIONAL_MEASUREMENT_IDS = [
  "under_bust_circumference",
  "hip_circumference",
  "square_neck_length",
  "square_neck_width",
  "shoulder_to_under_bust_length",
] as const;

export const getMeasurementProfileField = (
  profileId: MeasurementProfileId,
  measurementId: CanonicalMeasurementId,
): MeasurementProfileField | undefined =>
  MEASUREMENT_PROFILES.find((profile) => profile.id === profileId)?.fields.find(
    (field) => field.measurementId === measurementId,
  );

export const getRequiredMeasurementIdsForRoute = (
  profileId: MeasurementProfileId,
  route: MeasurementRiskRoute,
): CanonicalMeasurementId[] =>
  (MEASUREMENT_PROFILES.find((profile) => profile.id === profileId)?.fields || [])
    .filter((field) => field.directRoutes.includes(route))
    .map((field) => field.measurementId);
