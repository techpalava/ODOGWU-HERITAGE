const fs = require('fs');

let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const sCategoryText = `{s.category === "male"
                                    ? "Group 1 - Pioneers"
                                    : s.category === "female"
                                      ? "Group 2 - Transformers"
                                      : s.category === "fabric"
                                        ? "Group 3 - Avatars"
                                        : s.category === "group4"
                                          ? "Group 4 - Executives"
                                          : "Group 5 - Transformers"}`;

const sCategoryNew = `{(() => {
                                      let bNum = 0;
                                      if (s.category === "male") bNum = 1;
                                      else if (s.category === "female") bNum = 2;
                                      else if (s.category === "fabric") bNum = 3;
                                      else if (s.category === "group4") bNum = 4;
                                      else if (s.category === "group5") bNum = 5;
                                      else if (s.category.startsWith("group")) bNum = parseInt(s.category.replace("group", ""));
                                      
                                      if (bNum > 0) {
                                        const b = batches.find(x => x.batchNumber === bNum);
                                        if (b) return \`Group \${b.batchNumber} - \${b.name}\`;
                                        return \`Group \${bNum}\`;
                                      }
                                      return s.category;
                                    })()}`;

content = content.replace(sCategoryText, sCategoryNew);

fs.writeFileSync('src/components/DatabaseView.tsx', content);
