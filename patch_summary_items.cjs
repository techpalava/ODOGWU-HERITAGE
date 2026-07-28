const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regex = /const GarmentDetailSummaryItems = \(\{[\s\S]*?<\/>\n  \);\n\};/;
const newComponent = `const GarmentDetailSummaryItems = ({ designSelections, isLi = false, currencySymbol, style }: { designSelections: any, isLi?: boolean, currencySymbol: string, style?: any }) => {
  const items = getGarmentDetailsBreakdown(designSelections, style).map(item => {
    const display = item.price === 0 ? 'Included' : \`+\${currencySymbol}\${item.price.toFixed(2)}\`;
    return { ...item, display };
  });

  return (
    <>
      {items.map((item: any, i: number) => 
        isLi ? (
          <li key={i}>
            {item.label}{item.value ? ': ' : ' '}<strong>{item.value}</strong> <span className="text-heritage-gold ml-1">({item.display})</span>
          </li>
        ) : (
          <p key={i}>
            {item.label}{item.value ? ': ' : ' '}<strong className="text-heritage-green">{item.value}</strong> <span className="text-heritage-gold ml-1">({item.display})</span>
          </p>
        )
      )}
    </>
  );
};`;
content = content.replace(regex, newComponent);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
