import fs from 'fs';

let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

content = content.replace(
  /BatchBusinessRules\.getHeroPresentation/g,
  'BatchBusinessRules.getPresentation'
);

fs.writeFileSync('src/components/HomeView.tsx', content);
