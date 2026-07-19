const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');

if (!content.includes('includedDesignFeatures')) {
  const target = `  // Premium features
  hasMonogram?: boolean;
  hasEmbroidery?: boolean;
  hasMonogramTrimming?: boolean;`;
  const rep = `  // Premium features
  hasMonogram?: boolean;
  hasEmbroidery?: boolean;
  hasMonogramTrimming?: boolean;
  includedDesignFeatures?: {
    hasMonogram?: boolean;
    hasEmbroidery?: boolean;
    hasMonogramTrimming?: boolean;
  };`;
  content = content.replace(target, rep);
  fs.writeFileSync('src/types.ts', content);
}
