const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');
const lines = content.split('\n');

const before = lines.slice(0, 2518);
const after = lines.slice(2972);

const injection = [
  '          {currentStep === 3 && (',
  '            <div className="space-y-6">',
  '              <div className="space-y-1 text-center sm:text-left">',
  '                <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">',
  '                  Step 3 of 9',
  '                </span>',
  '                <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">',
  '                  Customize Garment Details',
  '                </h2>',
  '                <p className="text-xs text-heritage-ink/75 leading-relaxed">',
  '                  Select lengths, pockets, embroideries, and accessories for your outfit.',
  '                </p>',
  '              </div>',
  '              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">',
  '                <GarmentDetailSelector',
  '                  selectedStyle={selectedStyle}',
  '                  selectedGarment={selectedGarment}',
  '                  designSelections={designSelections}',
  '                  setDesignSelections={setDesignSelections}',
  '                  hasLining={hasLining}',
  '                  setHasLining={setHasLining}',
  '                  currencySymbol={currencySymbol}',
  '                />',
  '              </div>',
  '            </div>',
  '          )}'
];

const result = [...before, ...injection, ...after].join('\n');
fs.writeFileSync('src/components/DesignStudioView.tsx', result);
