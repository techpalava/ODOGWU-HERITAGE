import fs from 'fs';

let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

content = content.replace(
  /\{active\.targetGarments\} Garments/g,
  '{CapacityService.getTargetCapacity(active)} Garments'
);

fs.writeFileSync('src/components/DatabaseView.tsx', content);
