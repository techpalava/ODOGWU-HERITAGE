const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

if (content.includes('CustomerJourneyEngine')) {
  console.log("Already integrated CustomerJourneyEngine");
} else {
  console.log("CustomerJourneyEngine is missing");
}
