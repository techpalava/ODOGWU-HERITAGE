const fs = require('fs');
let content = fs.readFileSync('src/components/CartDrawer.tsx', 'utf8');

const importStatement = "import { GARMENT_DETAIL_OPTIONS } from '../config/GarmentDetailsConfig';\n";
content = importStatement + content;

const regex = /<p>\s*🪡 Accent\: <strong>.*?<\/strong>\s*<\/p>/g;
const replacement = `{Object.values(item.design.customDetails || {}).map(optId => {
                          const opt = GARMENT_DETAIL_OPTIONS.find(o => o.id === optId);
                          if (!opt) return null;
                          return (
                            <p key={opt.id}>
                              🪡 {opt.selectionGroup.replace(/_/g, ' ')}: <strong>{opt.label}</strong>
                            </p>
                          );
                        })}`;
content = content.replace(regex, replacement);

fs.writeFileSync('src/components/CartDrawer.tsx', content);
