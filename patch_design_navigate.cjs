const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace('onClick={() => onNavigateToTab(journey.destination as any)}', 'onClick={() => _onNavigateToTab(journey.destination as any)}');

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
