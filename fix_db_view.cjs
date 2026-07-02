const fs = require('fs');

let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const selectOptionsToReplace1 = `<option value="male">Group 1 - Pioneers</option>
                        <option value="female">Group 2 - Transformers</option>
                        <option value="fabric">Group 3 - Avatars</option>
                        <option value="group4">Group 4 - Executives</option>
                        <option value="group5">Group 5 - Transformers</option>`;

const getBatchCategory = `(batchNumber: number) => {
                          switch (batchNumber) {
                            case 1: return "male";
                            case 2: return "female";
                            case 3: return "fabric";
                            case 4: return "group4";
                            case 5: return "group5";
                            default: return \`group\${batchNumber}\`;
                          }
                        }`;

const selectOptionsNew1 = `{batches.sort((a,b) => a.batchNumber - b.batchNumber).map((b) => {
                          const catValue = (() => {
                            switch (b.batchNumber) {
                              case 1: return "male";
                              case 2: return "female";
                              case 3: return "fabric";
                              case 4: return "group4";
                              case 5: return "group5";
                              default: return \`group\${b.batchNumber}\`;
                            }
                          })();
                          return (
                            <option key={catValue} value={catValue}>
                              Group {b.batchNumber} - {b.name}
                            </option>
                          );
                        })}`;

content = content.replace(selectOptionsToReplace1, selectOptionsNew1);

const selectOptionsToReplace2 = `<option value="Group 1 - Pioneers">Group 1 - Pioneers</option>
                        <option value="Group 2 - Transformers">Group 2 - Transformers</option>
                        <option value="Group 3 - Avatars">Group 3 - Avatars</option>
                        <option value="Group 4 - Executives">Group 4 - Executives</option>
                        <option value="Group 5 - Transformers">Group 5 - Transformers</option>`;

const selectOptionsNew2 = `{batches.sort((a,b) => a.batchNumber - b.batchNumber).map((b) => {
                          const cohortName = \`Group \${b.batchNumber} - \${b.name}\`;
                          return (
                            <option key={b.batchNumber} value={cohortName}>
                              {cohortName}
                            </option>
                          );
                        })}`;

content = content.replace(selectOptionsToReplace2, selectOptionsNew2);

const inlineTextReplace1 = `editingItem.category === "male"
                                    ? "Group 1 - Pioneers"
                                    : editingItem.category === "female"
                                      ? "Group 2 - Transformers"
                                      : editingItem.category === "fabric"
                                        ? "Group 3 - Avatars"
                                        : editingItem.category === "group4"
                                          ? "Group 4 - Executives"
                                          : "Group 5 - Transformers"`;

const inlineTextNew1 = `(() => {
                                      let bNum = 0;
                                      if (editingItem.category === "male") bNum = 1;
                                      else if (editingItem.category === "female") bNum = 2;
                                      else if (editingItem.category === "fabric") bNum = 3;
                                      else if (editingItem.category === "group4") bNum = 4;
                                      else if (editingItem.category === "group5") bNum = 5;
                                      else if (editingItem.category.startsWith("group")) bNum = parseInt(editingItem.category.replace("group", ""));
                                      
                                      if (bNum > 0) {
                                        const b = batches.find(x => x.batchNumber === bNum);
                                        if (b) return \`Group \${b.batchNumber} - \${b.name}\`;
                                        return \`Group \${bNum}\`;
                                      }
                                      return editingItem.category;
                                    })()`;

content = content.replace(inlineTextReplace1, inlineTextNew1);

// We have one more hardcoded string: cohortName: "Group 1 - Pioneers"
content = content.replace(
  /cohortName: "Group 1 - Pioneers",/g,
  'cohortName: batches.length > 0 ? `Group ${batches[0].batchNumber} - ${batches[0].name}` : "",'
);

fs.writeFileSync('src/components/DatabaseView.tsx', content);
