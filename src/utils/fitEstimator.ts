/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Measurements } from "../types";

const roundToHalf = (num: number) => Math.round(num * 2) / 2;

/**
 * Predicts tailored garment measurements based on baseline body indicators.
 * Real-time heuristic calibration matching master traditional West-African tailor guidelines.
 */
export function estimateMeasurements(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
  ageYears: number | null | undefined,
  build: "Slim" | "Average" | "Muscular" | "Broad",
  fitPreference: "Slim/Executive" | "Standard" | "Relaxed",
  gender: "male" | "female" | "unisex" | "couple" | "family",
): Measurements {
  // 1. Establish intelligent defaults for missing parameters
  const finalHeight = heightCm || (gender === "female" ? 165 : 178);
  const finalAge = ageYears || 32;

  let finalWeight = weightKg;
  if (!finalWeight) {
    let multiplier = 0.93; // Average
    if (build === "Slim") multiplier = 0.82;
    else if (build === "Muscular") multiplier = 1.05;
    else if (build === "Broad") multiplier = 1.18;

    finalWeight = (finalHeight - 100) * multiplier;
    if (gender === "female") {
      finalWeight *= 0.9;
    }
    finalWeight = Math.round(finalWeight);
  }

  // 2. Establish absolute baseline references based on height and weight (Using official height baseline multipliers)
  const heightInches = finalHeight / 2.54;
  const isFemale = gender === "female";

  // Master Height Baseline multipliers from sheet:
  const multHead = 0.33;
  const multNeck = 0.25;
  const multShoulder = 0.27;
  const multSleeveShort = 0.15;
  const multSleeveLong = 0.36;
  const multAnkleSleeve = 0.13;
  const multShirtLengthStd = 0.43;
  const multChest = 0.67;
  const multWaist = 0.64;
  const multBicep = 0.19;
  const multElbow = 0.17;
  const multArmHole = 0.31;

  // Pants/Trousers Height Baseline multipliers from sheet:
  const multTrouserWaist = 0.59;
  const multTrouserHip = 0.64;
  const multTrouserThigh = 0.4;
  const multTrouserKnee = 0.28;
  const multTrouserAnkleHor = 0.24;
  const multTrouserWaistToHip = 0.08;
  const multTrouserCrotchDepth = 0.13;
  const multTrouserWaistToKnee = 0.28;
  const multTrouserWaistToAnkle = 0.53;
  const multTrouserWaistToFloor = 0.55;

  // Height Segments Baseline multipliers from sheet:
  const multHHeadToShoulder = 0.15;
  const multHShoulderToWaist = 0.29;
  const multHHeadToWaist = 0.44;
  const multHWaistToFloor = 0.56;

  // Base values calculated directly using official multipliers
  let headEst = heightInches * multHead;
  let neck = heightInches * multNeck;
  let shoulder = heightInches * multShoulder;
  let sleeveShortEst = heightInches * multSleeveShort;
  let sleeveLongEst = heightInches * multSleeveLong;
  let ankleCircEst = heightInches * multAnkleSleeve;
  let shirtLengthStdEst = heightInches * multShirtLengthStd;
  let chest = heightInches * multChest;
  let waist = heightInches * multWaist;
  let bicepEst = heightInches * multBicep;
  let elbowEst = heightInches * multElbow;
  let armHoleEst = heightInches * multArmHole;

  let trouserWaistEst = heightInches * multTrouserWaist;
  let trouserHipEst = heightInches * multTrouserHip;
  let trouserThighEst = heightInches * multTrouserThigh;
  let trouserKneeEst = heightInches * multTrouserKnee;
  let trouserAnkleHorEst = heightInches * multTrouserAnkleHor;
  let trouserAnkleDiagEst = trouserAnkleHorEst * 1.15; // standard custom diagonal
  let trouserWaistToHipEst = heightInches * multTrouserWaistToHip;
  let trouserCrotchDepthEst = heightInches * multTrouserCrotchDepth;
  let trouserWaistToKneeEst = heightInches * multTrouserWaistToKnee;
  let trouserWaistToAnkleEst = heightInches * multTrouserWaistToAnkle;
  let trouserWaistToFloorEst = heightInches * multTrouserWaistToFloor;

  const hHeadToShoulder = heightInches * multHHeadToShoulder;
  const hShoulderToWaist = heightInches * multHShoulderToWaist;
  const hHeadToWaist = heightInches * multHHeadToWaist;
  const hWaistToFloor = heightInches * multHWaistToFloor;

  // Select primary sleeve and trouser length from standard values
  let sleeve = sleeveLongEst;
  let trouserLength = trouserWaistToAnkleEst;

  // 3. Calibrate based on body build categories
  let scaleCircumference = 1.0;
  let scaleShoulder = 1.0;

  switch (build) {
    case "Slim":
      scaleCircumference = 0.94;
      scaleShoulder = 0.96;
      break;
    case "Muscular":
      scaleCircumference = 1.02;
      scaleShoulder = 1.04;
      bicepEst *= 1.08;
      trouserThighEst *= 1.06;
      break;
    case "Broad":
      scaleCircumference = 1.08;
      scaleShoulder = 1.06;
      break;
    case "Average":
    default:
      break;
  }

  // Apply build calibrations
  neck *= scaleCircumference;
  shoulder *= scaleShoulder;
  chest *= scaleCircumference;
  waist *= scaleCircumference;
  bicepEst *= scaleCircumference;
  elbowEst *= scaleCircumference;
  armHoleEst *= scaleCircumference;

  trouserWaistEst *= scaleCircumference;
  trouserHipEst *= scaleCircumference;
  trouserThighEst *= scaleCircumference;
  trouserKneeEst *= scaleCircumference;

  // 4. Calibrate based on custom fit preferences
  let scaleFit = 1.0;
  switch (fitPreference) {
    case "Slim/Executive":
      scaleFit = 0.97;
      break;
    case "Relaxed":
      scaleFit = 1.04;
      break;
    case "Standard":
    default:
      break;
  }

  // Apply fit preference adjustments to circumferences
  neck *= scaleFit;
  chest *= scaleFit;
  waist *= scaleFit;
  bicepEst *= scaleFit;
  trouserWaistEst *= scaleFit;
  trouserHipEst *= scaleFit;

  // 5. Calibrate based on biological gender profiles
  if (isFemale) {
    neck *= 0.95;
    shoulder *= 0.94;
    waist *= 0.95;
    trouserHipEst *= 1.05; // ladies hips
  }

  // Assign primary silhouette values
  let hip = trouserHipEst;

  // Ladies Specifics (Heuristics calibrated to master-tailor profiles)
  const underBorstEst = isFemale ? chest * 0.84 : undefined;
  const squareNeckLengthEst = isFemale ? 7.0 : undefined;
  const squareNeckWidthEst = isFemale ? 6.5 : undefined;
  const shoulderToUnderBorstEst = isFemale ? 13.5 : undefined;
  const shirtLengthLongEst = shirtLengthStdEst * 1.35;

  return {
    height: finalHeight,
    weight: finalWeight,
    age: finalAge,
    bodyBuild: build,
    fitPreference: fitPreference,
    neck: roundToHalf(neck),
    shoulder: roundToHalf(shoulder),
    chest: roundToHalf(chest),
    waist: roundToHalf(waist),
    hip: roundToHalf(hip),
    sleeve: roundToHalf(sleeve),
    trouserLength: roundToHalf(trouserLength),
    isAiEstimated: true,
    unit: "inch",

    // Shirts/Dress Advanced Heuristics
    head: roundToHalf(headEst),
    ankleCircumference: roundToHalf(ankleCircEst),
    shirtLengthStandard: roundToHalf(shirtLengthStdEst),
    shirtLengthLong: roundToHalf(shirtLengthLongEst),
    bicep: roundToHalf(bicepEst),
    elbow: roundToHalf(elbowEst),
    armHole: roundToHalf(armHoleEst),
    underBorst: underBorstEst ? roundToHalf(underBorstEst) : undefined,
    hipCircumference: isFemale ? roundToHalf(hip) : undefined,
    squareNeckLength: squareNeckLengthEst
      ? roundToHalf(squareNeckLengthEst)
      : undefined,
    squareNeckWidth: squareNeckWidthEst
      ? roundToHalf(squareNeckWidthEst)
      : undefined,
    shoulderToUnderBorst: shoulderToUnderBorstEst
      ? roundToHalf(shoulderToUnderBorstEst)
      : undefined,

    // Pants/Shorts Advanced Heuristics
    trouserWaist: roundToHalf(trouserWaistEst),
    trouserHip: roundToHalf(trouserHipEst),
    trouserThigh: roundToHalf(trouserThighEst),
    trouserKnee: roundToHalf(trouserKneeEst),
    trouserAnkleHorizontal: roundToHalf(trouserAnkleHorEst),
    trouserAnkleDiagonal: roundToHalf(trouserAnkleDiagEst),
    trouserWaistToHip: roundToHalf(trouserWaistToHipEst),
    trouserCrotchDepth: roundToHalf(trouserCrotchDepthEst),
    trouserWaistToKnee: roundToHalf(trouserWaistToKneeEst),
    trouserWaistToAnkle: roundToHalf(trouserWaistToAnkleEst),
    trouserWaistToFloor: roundToHalf(trouserWaistToFloorEst),

    // Heights Segments Heuristics
    heightHeadToShoulder: roundToHalf(hHeadToShoulder),
    heightShoulderToWaist: roundToHalf(hShoulderToWaist),
    heightHeadToWaist: roundToHalf(hHeadToWaist),
    heightWaistToFloor: roundToHalf(hWaistToFloor),
  };
}
