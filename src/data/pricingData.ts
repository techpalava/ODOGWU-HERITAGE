/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PriceItem {
  code: string;
  category: "guys" | "ladies" | "others";
  description: string;
  quantity: string;
  actualMin: number;
  actualMax: number;
  discountedMin: number;
  discountedMax: number;
}

export const OFFICIAL_PRICE_LIST: PriceItem[] = [
  // Guys Section
  {
    code: "G1",
    category: "guys",
    description: "Short Sleeve Shirt for Guys",
    quantity: "1 piece",
    actualMin: 150.0,
    actualMax: 150.0,
    discountedMin: 50.0,
    discountedMax: 50.0,
  },
  {
    code: "G2",
    category: "guys",
    description: "Mid to Long Sleeve Shirt for Guys",
    quantity: "1 piece",
    actualMin: 155.0,
    actualMax: 155.0,
    discountedMin: 55.0,
    discountedMax: 55.0,
  },
  {
    code: "G3",
    category: "guys",
    description: "Leg Pant (Shorts) for Guys",
    quantity: "1 piece",
    actualMin: 155.0,
    actualMax: 155.0,
    discountedMin: 55.0,
    discountedMax: 55.0,
  },
  {
    code: "G4",
    category: "guys",
    description: "Leg Pant (Trouser / Long) for Guys",
    quantity: "1 piece",
    actualMin: 160.0,
    actualMax: 160.0,
    discountedMin: 60.0,
    discountedMax: 60.0,
  },
  {
    code: "G5.1",
    category: "guys",
    description: "Short Sleeve Shirt + Leg Pant (Shorts) for Guys",
    quantity: "(1 + 1) pieces",
    actualMin: 300.0,
    actualMax: 300.0,
    discountedMin: 100.0,
    discountedMax: 100.0,
  },
  {
    code: "G5.2",
    category: "guys",
    description: "Short Sleeve Shirt + Leg Pant (Trouser) for Guys",
    quantity: "(1 + 1) pieces",
    actualMin: 305.0,
    actualMax: 305.0,
    discountedMin: 105.0,
    discountedMax: 105.0,
  },
  {
    code: "G6.1",
    category: "guys",
    description: "Mid to Long Sleeve Shirt + Leg Pant (Shorts) for Guys",
    quantity: "(1 + 1) pieces",
    actualMin: 305.0,
    actualMax: 305.0,
    discountedMin: 105.0,
    discountedMax: 105.0,
  },
  {
    code: "G6.2",
    category: "guys",
    description: "Mid to Long Sleeve Shirt + Leg Pant (Trouser) for Guys",
    quantity: "(1 + 1) pieces",
    actualMin: 310.0,
    actualMax: 310.0,
    discountedMin: 110.0,
    discountedMax: 110.0,
  },

  // Ladies Section
  {
    code: "L1",
    category: "ladies",
    description:
      "Short Sleeve, Standard Length (Before the Knee) Dress, No Lining/Inner net",
    quantity: "1 piece",
    actualMin: 155.0,
    actualMax: 155.0,
    discountedMin: 55.0,
    discountedMax: 55.0,
  },
  {
    code: "L2",
    category: "ladies",
    description:
      "Short Sleeve, From Knee to Longer Length Dress, No Lining/Inner net",
    quantity: "1 piece",
    actualMin: 160.0,
    actualMax: 160.0,
    discountedMin: 60.0,
    discountedMax: 60.0,
  },
  {
    code: "L3",
    category: "ladies",
    description:
      "Mid to Long Sleeve, Standard Length (Before the Knee) Dress, No Lining/Inner net",
    quantity: "1 piece",
    actualMin: 160.0,
    actualMax: 160.0,
    discountedMin: 60.0,
    discountedMax: 60.0,
  },
  {
    code: "L4",
    category: "ladies",
    description:
      "Mid to Long Sleeve, Knee to Long Length Dress, No Lining/Inner net",
    quantity: "1 piece",
    actualMin: 165.0,
    actualMax: 165.0,
    discountedMin: 65.0,
    discountedMax: 65.0,
  },
  {
    code: "L5",
    category: "ladies",
    description: "For L1, L2, L3 or L4, With Lining/Inner net (Surcharge)",
    quantity: "1 piece",
    actualMin: 165.0,
    actualMax: 175.0,
    discountedMin: 65.0,
    discountedMax: 75.0,
  },
  {
    code: "L6",
    category: "ladies",
    description: "Leg Pant or Skirt, Short-Length (Up to Knee)",
    quantity: "1 piece",
    actualMin: 160.0,
    actualMax: 160.0,
    discountedMin: 60.0,
    discountedMax: 60.0,
  },
  {
    code: "L7",
    category: "ladies",
    description: "Leg Pant or Skirt, Longer-Length (From Knee to Ankle)",
    quantity: "1 piece",
    actualMin: 165.0,
    actualMax: 165.0,
    discountedMin: 65.0,
    discountedMax: 65.0,
  },
  {
    code: "L8.1",
    category: "ladies",
    description: "L1 or L2 Combined with L6",
    quantity: "(1 + 1) pieces",
    actualMin: 310.0,
    actualMax: 315.0,
    discountedMin: 110.0,
    discountedMax: 115.0,
  },
  {
    code: "L8.2",
    category: "ladies",
    description: "L1 or L2 Combined with L7",
    quantity: "(1 + 1) pieces",
    actualMin: 315.0,
    actualMax: 320.0,
    discountedMin: 115.0,
    discountedMax: 120.0,
  },
  {
    code: "L9.1",
    category: "ladies",
    description: "L3 or L4 Combined with L6",
    quantity: "(1 + 1) pieces",
    actualMin: 315.0,
    actualMax: 320.0,
    discountedMin: 115.0,
    discountedMax: 120.0,
  },
  {
    code: "L9.2",
    category: "ladies",
    description: "L3 or L4 Combined with L7",
    quantity: "(1 + 1) pieces",
    actualMin: 320.0,
    actualMax: 325.0,
    discountedMin: 120.0,
    discountedMax: 125.0,
  },

  // Others Section
  {
    code: "Others-1",
    category: "others",
    description:
      "Either for a Traditional HAT, a BEAD or to have your NAME INSCRIBED on Shirt/Dress",
    quantity: "per item",
    actualMin: 30.0,
    actualMax: 30.0,
    discountedMin: 10.0,
    discountedMax: 10.0,
  },
];
