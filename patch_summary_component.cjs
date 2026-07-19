const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const injection = `
const GarmentDetailSummaryItems = ({ designSelections, isLi = false, currencySymbol }: { designSelections: any, isLi?: boolean, currencySymbol: string }) => {
  const fields = [
    { key: 'topLength', label: 'Top Length' },
    { key: 'topPocket', label: 'Top Pocket' },
    { key: 'dressLength', label: 'Dress Length' },
    { key: 'dressPocket', label: 'Dress Pocket' },
    { key: 'sleeveLength', label: 'Sleeve Length' },
    { key: 'trouserFastening', label: 'Trouser Fastening' },
    { key: 'trouserPocket', label: 'Trouser Pocket' },
    { key: 'shortFastening', label: 'Short Fastening' },
    { key: 'shortPocket', label: 'Short Pocket' },
    { key: 'skirtLength', label: 'Skirt Length' },
    { key: 'skirtPocket', label: 'Skirt Pocket' },
    { key: 'embroideryDesign', label: 'Monogram & Embroidery' }
  ];

  const items = fields.map(f => {
    if (designSelections[f.key]) {
      const priceMap = GARMENT_DETAIL_PRICING[f.key] || {};
      const price = priceMap[designSelections[f.key]] || 0;
      const display = price === 0 ? 'Included' : \`+\${currencySymbol}\${price.toFixed(2)}\`;
      return { label: f.label, value: designSelections[f.key], display };
    }
    return null;
  }).filter(Boolean);

  if (designSelections.accessories && designSelections.accessories.length > 0) {
    designSelections.accessories.forEach((acc: string) => {
      const price = GARMENT_DETAIL_PRICING.accessories[acc] || 0;
      const display = price === 0 ? 'Included' : \`+\${currencySymbol}\${price.toFixed(2)}\`;
      items.push({ label: 'Accessory', value: acc, display });
    });
  }

  return (
    <>
      {items.map((item: any, i: number) => 
        isLi ? (
          <li key={i}>
            {item.label}: <strong>{item.value}</strong> <span className="text-heritage-gold ml-1">({item.display})</span>
          </li>
        ) : (
          <p key={i}>
            {item.label}: <strong className="text-heritage-green">{item.value}</strong> <span className="text-heritage-gold ml-1">({item.display})</span>
          </p>
        )
      )}
    </>
  );
};
`;

content = content.replace('export default function DesignStudioView(', injection + '\nexport default function DesignStudioView(');
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
