import type {
  CustomDetailDemographic,
  FabricGarmentType,
  MeasurementRiskRoute,
} from "../types";

export const MEASUREMENT_BLUEPRINT_VERSION =
  "measurements-steps-website-v1@8b59ab07" as const;
export const MEASUREMENT_FORMULA_VERSION = null;
export const MEASUREMENT_SOURCE_SHA256 =
  "8B59AB078BDA1A7376CA3A6A77AA24CC3AFA760CCCD0B037C163A886FA919DF7" as const;

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
  instructions?: string;
}

export interface MeasurementProfileField {
  sourceRow: number;
  measurementId: CanonicalMeasurementId;
  directRoutes: readonly MeasurementRiskRoute[];
  averageFactor: number | null;
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
  definition("total_height", "Height (Total Height)", "Total Height", "total_height"),
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
  averageFactor: number | null,
  conditional?: boolean,
];

const routesFromMask = (mask: number): MeasurementRiskRoute[] => [
  ...(mask & 1 ? ["low_risk" as const] : []),
  ...(mask & 2 ? ["medium_risk" as const] : []),
  ...(mask & 4 ? ["high_risk" as const] : []),
];

const profileFields = (
  profileId: MeasurementProfileId,
  tuples: readonly SourceTuple[],
): MeasurementProfileField[] => tuples.map(([sourceRow, measurementId, routeMask, averageFactor, conditional]) => ({
  sourceRow,
  measurementId,
  directRoutes: routesFromMask(routeMask),
  averageFactor,
  factorStatus: averageFactor === null ? "missing" : "present",
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
  ...(profileId === "L" && (measurementId === "waist_to_lap_length" || measurementId === "waist_to_knee_length")
    ? { alternativeGroup: "L_skirt_length" }
    : {}),
}));

const PROFILE_ROWS: Readonly<Record<MeasurementProfileId, readonly SourceTuple[]>> = {
  A: [[15,"head_circumference",1,0.343366501291449],[16,"neck_circumference",1,0.237512850768436],[17,"shoulder_length",3,0.256919376750829],[18,"shirt_length_standard",1,0.44789871685868],[19,"sleeve_length_short",1,0.140482628872026],[20,"chest_bust_circumference",7,0.571563968173318],[21,"belly_circumference",7,0.508358355805672],[22,"bicep_circumference",1,0.199866829871064],[23,"elbow_circumference",1,0.172224034723017],[24,"armhole_circumference",3,0.295422123205804],[25,"total_height",7,1],[27,"height_head_to_lower_neck",3,0.151682300586608],[28,"height_lower_neck_to_waist",3,0.287574416786155],[29,"height_waist_to_feet",3,0.563300135815008]],
  B: [[33,"head_circumference",1,0.343366501291449],[34,"neck_circumference",1,0.237512850768436],[35,"shoulder_length",3,0.256919376750829],[36,"shirt_length_standard",1,0.44789871685868],[37,"sleeve_length_mid",1,null],[38,"sleeve_length_long",1,0.3468546540286],[39,"chest_bust_circumference",7,0.571563968173318],[40,"belly_circumference",7,0.508358355805672],[41,"bicep_circumference",1,0.199866829871064],[42,"elbow_circumference",1,0.172224034723017],[43,"armhole_circumference",3,0.295422123205804],[44,"total_height",7,1],[46,"height_head_to_lower_neck",3,0.151682300586608],[47,"height_lower_neck_to_waist",3,0.287574416786155],[48,"height_waist_to_feet",3,0.563300135815008]],
  C: [[52,"head_circumference",1,0.343366501291449],[53,"neck_circumference",1,0.237512850768436],[54,"shoulder_length",3,0.256919376750829],[55,"shirt_length_long",1,0.597092331523786],[56,"sleeve_length_short",1,0.140482628872026],[57,"wrist_circumference",7,0.126960814185041],[58,"chest_bust_circumference",7,0.571563968173318],[59,"belly_circumference",7,0.508358355805672],[60,"bicep_circumference",1,0.199866829871064],[61,"elbow_circumference",1,0.172224034723017],[62,"armhole_circumference",3,0.295422123205804],[63,"total_height",7,1],[65,"height_head_to_lower_neck",3,0.151682300586608],[66,"height_lower_neck_to_waist",3,0.287574416786155],[67,"height_waist_to_feet",3,0.563300135815008]],
  D: [[71,"head_circumference",1,0.343366501291449],[72,"neck_circumference",1,0.237512850768436],[73,"shoulder_length",3,0.256919376750829],[74,"shirt_length_long",1,0.597092331523786],[75,"sleeve_length_mid",1,null],[76,"sleeve_length_long",1,0.3468546540286],[77,"wrist_circumference",7,0.126960814185041],[78,"chest_bust_circumference",7,0.571563968173318],[79,"belly_circumference",7,0.508358355805672],[80,"bicep_circumference",1,0.199866829871064],[81,"elbow_circumference",1,0.172224034723017],[82,"armhole_circumference",3,0.295422123205804],[83,"total_height",7,1],[85,"height_head_to_lower_neck",3,0.151682300586608],[86,"height_lower_neck_to_waist",3,0.287574416786155],[87,"height_waist_to_feet",3,0.563300135815008]],
  E: [[91,"head_circumference",1,0.343366501291449],[92,"neck_circumference",1,0.237512850768436],[93,"shoulder_length",3,0.256919376750829],[94,"dress_length_standard",1,0.44789871685868],[95,"sleeve_length_sleeveless",1,null],[96,"sleeve_length_short",1,0.140482628872026],[97,"chest_bust_circumference",7,0.571563968173318],[98,"belly_circumference",7,0.508358355805672],[99,"bicep_circumference",1,0.199866829871064],[100,"elbow_circumference",1,0.172224034723017],[101,"armhole_circumference",3,0.295422123205804],[102,"total_height",7,1],[104,"height_head_to_lower_neck",3,0.151682300586608],[105,"height_lower_neck_to_waist",3,0.287574416786155],[106,"height_waist_to_feet",3,0.563300135815008],[108,"under_bust_circumference",3,null,true],[109,"hip_circumference",3,null,true],[110,"square_neck_length",3,null,true],[111,"square_neck_width",3,null,true],[112,"shoulder_to_under_bust_length",3,null,true]],
  F: [[116,"head_circumference",1,0.343366501291449],[117,"neck_circumference",1,0.237512850768436],[118,"shoulder_length",3,0.256919376750829],[119,"dress_length_standard",1,0.44789871685868],[120,"sleeve_length_mid",1,null],[121,"sleeve_length_long",1,0.3468546540286],[122,"chest_bust_circumference",7,0.571563968173318],[123,"belly_circumference",7,0.508358355805672],[124,"bicep_circumference",1,0.199866829871064],[125,"elbow_circumference",1,0.172224034723017],[126,"armhole_circumference",3,0.295422123205804],[127,"total_height",7,1],[129,"height_head_to_lower_neck",3,0.151682300586608],[130,"height_lower_neck_to_waist",3,0.287574416786155],[131,"height_waist_to_feet",3,0.563300135815008],[133,"under_bust_circumference",3,null,true],[134,"hip_circumference",3,null,true],[135,"square_neck_length",3,null,true],[136,"square_neck_width",3,null,true],[137,"shoulder_to_under_bust_length",3,null,true]],
  G: [[141,"head_circumference",1,0.343366501291449],[142,"neck_circumference",1,0.237512850768436],[143,"shoulder_length",3,0.256919376750829],[144,"dress_length_long",1,null],[145,"sleeve_length_sleeveless",1,null],[146,"sleeve_length_short",1,0.140482628872026],[147,"chest_bust_circumference",7,0.571563968173318],[148,"belly_circumference",7,0.508358355805672],[149,"bicep_circumference",1,0.199866829871064],[150,"elbow_circumference",1,0.172224034723017],[151,"armhole_circumference",3,0.295422123205804],[152,"total_height",7,1],[154,"height_head_to_lower_neck",3,0.151682300586608],[155,"height_lower_neck_to_waist",3,0.287574416786155],[156,"height_waist_to_feet",3,0.563300135815008],[158,"under_bust_circumference",3,null,true],[159,"hip_circumference",3,null,true],[160,"square_neck_length",3,null,true],[161,"square_neck_width",3,null,true],[162,"shoulder_to_under_bust_length",3,null,true]],
  H: [[166,"head_circumference",1,0.343366501291449],[167,"neck_circumference",1,0.237512850768436],[168,"shoulder_length",3,0.256919376750829],[169,"dress_length_long",1,null],[170,"sleeve_length_mid",1,null],[171,"sleeve_length_long",1,0.3468546540286],[172,"chest_bust_circumference",7,0.571563968173318],[173,"belly_circumference",7,0.508358355805672],[174,"bicep_circumference",1,0.199866829871064],[175,"elbow_circumference",1,0.172224034723017],[176,"armhole_circumference",3,0.295422123205804],[177,"total_height",7,1],[179,"height_head_to_lower_neck",3,0.151682300586608],[180,"height_lower_neck_to_waist",3,0.287574416786155],[181,"height_waist_to_feet",3,0.563300135815008],[183,"under_bust_circumference",3,null,true],[184,"hip_circumference",3,null,true],[185,"square_neck_length",3,null,true],[186,"square_neck_width",3,null,true],[187,"shoulder_to_under_bust_length",3,null,true]],
  I: [[191,"waist_circumference",7,0.512617442081532],[192,"hip_circumference",3,0.584591437335114],[193,"thigh_circumference",7,0.34412223085074],[194,"knee_circumference",1,0.242042112706051],[195,"ankle_circumference",1,0.198771501312092],[196,"waist_to_hip_length",1,0.0897214528042889],[197,"waist_to_crotch_depth_length",7,0.131833343719864],[198,"waist_to_knee_length",1,0.289493733847171],[199,"waist_to_ankle_length",3,0.535919333317358],[200,"waist_to_feet_side_length",1,0.561814572654843],[201,"waist_to_feet_back_length",3,null],[202,"total_height",7,1],[204,"height_head_to_lower_neck",3,0.151682300586608],[205,"height_lower_neck_to_waist",3,0.287574416786155],[206,"height_waist_to_feet",3,0.563300135815008]],
  J: [[210,"waist_circumference",7,0.512617442081532],[211,"hip_circumference",3,0.584591437335114],[212,"thigh_circumference",7,0.34412223085074],[213,"knee_circumference",1,0.242042112706051],[214,"waist_to_hip_length",1,0.0897214528042889],[215,"waist_to_crotch_depth_length",3,0.131833343719864],[216,"waist_to_knee_length",7,0.289493733847171],[217,"total_height",7,1],[219,"height_head_to_lower_neck",3,0.151682300586608],[220,"height_lower_neck_to_waist",3,0.287574416786155],[221,"height_waist_to_feet",3,0.563300135815008]],
  K: [[225,"waist_circumference",7,0.512617442081532],[226,"hip_circumference",3,0.584591437335114],[227,"thigh_circumference",7,0.34412223085074],[228,"knee_circumference",1,0.242042112706051],[229,"waist_to_hip_length",1,0.0897214528042889],[230,"waist_to_crotch_depth_length",3,0.131833343719864],[231,"waist_to_lap_length",7,null],[232,"total_height",7,1],[234,"height_head_to_lower_neck",3,0.151682300586608],[235,"height_lower_neck_to_waist",3,0.287574416786155],[236,"height_waist_to_feet",3,0.563300135815008]],
  L: [[240,"waist_circumference",7,0.512617442081532],[241,"hip_circumference",3,0.584591437335114],[242,"thigh_circumference",1,0.34412223085074],[243,"waist_to_hip_length",1,0.0897214528042889],[244,"skirt_bottom_circumference",3,null],[245,"waist_to_lap_length",7,null],[246,"waist_to_knee_length",7,0.242042112706051],[247,"total_height",7,1],[249,"height_head_to_lower_neck",3,0.151682300586608],[250,"height_lower_neck_to_waist",3,0.287574416786155],[251,"height_waist_to_feet",3,0.563300135815008]],
  M: [[255,"waist_circumference",7,0.512617442081532],[256,"hip_circumference",3,0.584591437335114],[257,"thigh_circumference",1,0.34412223085074],[258,"waist_to_hip_length",1,0.0897214528042889],[259,"skirt_bottom_circumference",3,null],[260,"waist_to_ankle_length",7,null],[261,"total_height",7,1],[263,"height_head_to_lower_neck",3,0.151682300586608],[264,"height_lower_neck_to_waist",3,0.287574416786155],[265,"height_waist_to_feet",3,0.563300135815008]],
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
  E: { low_risk: 20, medium_risk: 13, high_risk: 3 },
  F: { low_risk: 20, medium_risk: 13, high_risk: 3 },
  G: { low_risk: 20, medium_risk: 13, high_risk: 3 },
  H: { low_risk: 20, medium_risk: 13, high_risk: 3 },
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
