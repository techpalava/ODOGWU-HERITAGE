const fs = require('fs');

let content = fs.readFileSync('src/components/GalleryView.tsx', 'utf8');

// The getBatchCategory function maps batchNumber to category string:
// 1 -> male, 2 -> female, 3 -> fabric, 4 -> group4, 5 -> group5

// We can add a function to get the batch name given the category string.
const nameFn = `
  const getBatchCategory = (batchNumber) => {
    switch (batchNumber) {
      case 1: return "male";
      case 2: return "female";
      case 3: return "fabric";
      case 4: return "group4";
      case 5: return "group5";
      default: return \`group\${batchNumber}\`;
    }
  };

  const getBatchNameFromCategory = (catStr) => {
    let bNum = 0;
    if (catStr === "male") bNum = 1;
    else if (catStr === "female") bNum = 2;
    else if (catStr === "fabric") bNum = 3;
    else if (catStr === "group4") bNum = 4;
    else if (catStr === "group5") bNum = 5;
    else if (catStr.startsWith("group")) bNum = parseInt(catStr.replace("group", ""));
    
    if (bNum > 0) {
      const b = batches.find(x => x.batchNumber === bNum);
      if (b) return \`Group \${b.batchNumber} - \${b.name}\`;
      return \`Group \${bNum}\`;
    }
    return catStr;
  };`;

content = content.replace(
  /const getBatchCategory = \(batchNumber\) => \{[\s\S]*?\};\n/,
  nameFn
);

// Replace hardcoded strings in community gallery section
const commPhotosStart = `const pioneers = activeCommunityPhotos.filter((p) => p.cohortName === "Group 1 - Pioneers");`;
const commPhotosRegex = /const pioneers = activeCommunityPhotos\.filter.*?\.filter\(g => g\.photos\.length > 0\);/s;

const commPhotosNew = `const groups = batches.sort((a,b) => a.batchNumber - b.batchNumber).map(b => {
                    const title = \`Group \${b.batchNumber} - \${b.name}\`;
                    // some photos might have been saved with old hardcoded names, map them:
                    let legacyName = "";
                    if (b.batchNumber === 1) legacyName = "Group 1 - Pioneers";
                    else if (b.batchNumber === 2) legacyName = "Group 2 - Transformers";
                    else if (b.batchNumber === 3) legacyName = "Group 3 - Avatars";
                    else if (b.batchNumber === 4) legacyName = "Group 4 - Executives";
                    else if (b.batchNumber === 5) legacyName = "Group 5 - Transformers";
                    
                    const photos = activeCommunityPhotos.filter(p => p.cohortName === title || (legacyName && p.cohortName === legacyName));
                    return { title, photos };
                  });
                  
                  const otherPhotos = activeCommunityPhotos.filter(p => {
                    return !groups.some(g => g.photos.some(photo => photo.id === p.id));
                  });
                  
                  if (otherPhotos.length > 0) {
                    groups.push({ title: "Other / Uncategorized", photos: otherPhotos });
                  }
                  
                  const activeGroups = groups.filter(g => g.photos.length > 0);`;

content = content.replace(commPhotosRegex, commPhotosNew);
content = content.replace(/groups\.map\(group => \(/, 'activeGroups.map(group => (');


// Replace hardcoded strings in showpieces sections
// Group 3
content = content.replace(
  /Group 3 - Avatars/g,
  '{getBatchNameFromCategory("fabric")}'
);
content = content.replace(
  /Group 1 - Pioneers/g,
  '{getBatchNameFromCategory("male")}'
);
content = content.replace(
  /Group 2 - Transformers/g,
  '{getBatchNameFromCategory("female")}'
);
content = content.replace(
  /Group 4 - Executives/g,
  '{getBatchNameFromCategory("group4")}'
);
content = content.replace(
  /Group 5 - Transformers/g,
  '{getBatchNameFromCategory("group5")}'
);

// We need to fix the JSX curly braces for the ones we just replaced inside HTML text nodes.
// If it was already in JS, e.g. "Group 1 - Pioneers", it's fine, but in HTML text nodes it needs to be `{...}`

fs.writeFileSync('src/components/GalleryView.tsx', content);
