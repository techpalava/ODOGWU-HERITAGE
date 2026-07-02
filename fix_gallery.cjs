const fs = require('fs');
let content = fs.readFileSync('src/components/GalleryView.tsx', 'utf8');

// Fix the legacyName lines
content = content.replace(/legacyName = "\{getBatchNameFromCategory\("male"\)\}";/g, 'legacyName = "Group 1 - Pioneers";');
content = content.replace(/legacyName = "\{getBatchNameFromCategory\("female"\)\}";/g, 'legacyName = "Group 2 - Transformers";');
content = content.replace(/legacyName = "\{getBatchNameFromCategory\("fabric"\)\}";/g, 'legacyName = "Group 3 - Avatars";');
content = content.replace(/legacyName = "\{getBatchNameFromCategory\("group4"\)\}";/g, 'legacyName = "Group 4 - Executives";');
content = content.replace(/legacyName = "\{getBatchNameFromCategory\("group5"\)\}";/g, 'legacyName = "Group 5 - Transformers";');

fs.writeFileSync('src/components/GalleryView.tsx', content);
