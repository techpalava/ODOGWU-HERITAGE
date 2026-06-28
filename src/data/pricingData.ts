/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PriceItem {
  code: string;
  category: 'guys' | 'ladies' | 'others';
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
    code: 'G1',
    category: 'guys',
    description: 'Short Sleeve Shirt for Guys',
    quantity: '1 piece',
    actualMin: 150.00,
    actualMax: 150.00,
    discountedMin: 50.00,
    discountedMax: 50.00
  },
  {
    code: 'G2',
    category: 'guys',
    description: 'Mid to Long Sleeve Shirt for Guys',
    quantity: '1 piece',
    actualMin: 155.00,
    actualMax: 155.00,
    discountedMin: 55.00,
    discountedMax: 55.00
  },
  {
    code: 'G3',
    category: 'guys',
    description: 'Leg Pant (Shorts) for Guys',
    quantity: '1 piece',
    actualMin: 155.00,
    actualMax: 155.00,
    discountedMin: 55.00,
    discountedMax: 55.00
  },
  {
    code: 'G4',
    category: 'guys',
    description: 'Leg Pant (Trouser / Long) for Guys',
    quantity: '1 piece',
    actualMin: 160.00,
    actualMax: 160.00,
    discountedMin: 60.00,
    discountedMax: 60.00
  },
  {
    code: 'G5.1',
    category: 'guys',
    description: 'Short Sleeve Shirt + Leg Pant (Shorts) for Guys',
    quantity: '(1 + 1) pieces',
    actualMin: 300.00,
    actualMax: 300.00,
    discountedMin: 100.00,
    discountedMax: 100.00
  },
  {
    code: 'G5.2',
    category: 'guys',
    description: 'Short Sleeve Shirt + Leg Pant (Trouser) for Guys',
    quantity: '(1 + 1) pieces',
    actualMin: 305.00,
    actualMax: 305.00,
    discountedMin: 105.00,
    discountedMax: 105.00
  },
  {
    code: 'G6.1',
    category: 'guys',
    description: 'Mid to Long Sleeve Shirt + Leg Pant (Shorts) for Guys',
    quantity: '(1 + 1) pieces',
    actualMin: 305.00,
    actualMax: 305.00,
    discountedMin: 105.00,
    discountedMax: 105.00
  },
  {
    code: 'G6.2',
    category: 'guys',
    description: 'Mid to Long Sleeve Shirt + Leg Pant (Trouser) for Guys',
    quantity: '(1 + 1) pieces',
    actualMin: 310.00,
    actualMax: 310.00,
    discountedMin: 110.00,
    discountedMax: 110.00
  },

  // Ladies Section
  {
    code: 'L1',
    category: 'ladies',
    description: 'Short Sleeve, Standard Length (Before the Knee) Dress, No Lining/Inner net',
    quantity: '1 piece',
    actualMin: 155.00,
    actualMax: 155.00,
    discountedMin: 55.00,
    discountedMax: 55.00
  },
  {
    code: 'L2',
    category: 'ladies',
    description: 'Short Sleeve, From Knee to Longer Length Dress, No Lining/Inner net',
    quantity: '1 piece',
    actualMin: 160.00,
    actualMax: 160.00,
    discountedMin: 60.00,
    discountedMax: 60.00
  },
  {
    code: 'L3',
    category: 'ladies',
    description: 'Mid to Long Sleeve, Standard Length (Before the Knee) Dress, No Lining/Inner net',
    quantity: '1 piece',
    actualMin: 160.00,
    actualMax: 160.00,
    discountedMin: 60.00,
    discountedMax: 60.00
  },
  {
    code: 'L4',
    category: 'ladies',
    description: 'Mid to Long Sleeve, Knee to Long Length Dress, No Lining/Inner net',
    quantity: '1 piece',
    actualMin: 165.00,
    actualMax: 165.00,
    discountedMin: 65.00,
    discountedMax: 65.00
  },
  {
    code: 'L5',
    category: 'ladies',
    description: 'For L1, L2, L3 or L4, With Lining/Inner net (Surcharge)',
    quantity: '1 piece',
    actualMin: 165.00,
    actualMax: 175.00,
    discountedMin: 65.00,
    discountedMax: 75.00
  },
  {
    code: 'L6',
    category: 'ladies',
    description: 'Leg Pant or Skirt, Short-Length (Up to Knee)',
    quantity: '1 piece',
    actualMin: 160.00,
    actualMax: 160.00,
    discountedMin: 60.00,
    discountedMax: 60.00
  },
  {
    code: 'L7',
    category: 'ladies',
    description: 'Leg Pant or Skirt, Longer-Length (From Knee to Ankle)',
    quantity: '1 piece',
    actualMin: 165.00,
    actualMax: 165.00,
    discountedMin: 65.00,
    discountedMax: 65.00
  },
  {
    code: 'L8.1',
    category: 'ladies',
    description: 'L1 or L2 Combined with L6',
    quantity: '(1 + 1) pieces',
    actualMin: 310.00,
    actualMax: 315.00,
    discountedMin: 110.00,
    discountedMax: 115.00
  },
  {
    code: 'L8.2',
    category: 'ladies',
    description: 'L1 or L2 Combined with L7',
    quantity: '(1 + 1) pieces',
    actualMin: 315.00,
    actualMax: 320.00,
    discountedMin: 115.00,
    discountedMax: 120.00
  },
  {
    code: 'L9.1',
    category: 'ladies',
    description: 'L3 or L4 Combined with L6',
    quantity: '(1 + 1) pieces',
    actualMin: 315.00,
    actualMax: 320.00,
    discountedMin: 115.00,
    discountedMax: 120.00
  },
  {
    code: 'L9.2',
    category: 'ladies',
    description: 'L3 or L4 Combined with L7',
    quantity: '(1 + 1) pieces',
    actualMin: 320.00,
    actualMax: 325.00,
    discountedMin: 120.00,
    discountedMax: 125.00
  },

  // Others Section
  {
    code: 'Others-1',
    category: 'others',
    description: 'Either for a Traditional HAT, a BEAD or to have your NAME INSCRIBED on Shirt/Dress',
    quantity: 'per item',
    actualMin: 30.00,
    actualMax: 30.00,
    discountedMin: 10.00,
    discountedMax: 10.00
  }
];
