const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const regexBtn = /<button\s+id="btn-hero-join-cohort"\s+onClick=\{\(\) => onNavigateToTab\(heroDestination as any\)\}\s+className="bg-heritage-gold/;

const newBtn = `<button
                  id="btn-hero-join-cohort"
                  onClick={() => {
                    onNavigateToTab(heroDestination as any);
                    if (heroDestination === "custom-order") {
                      // Allow time for lazy loading and rendering
                      setTimeout(() => {
                        const el = document.getElementById("option-create-group");
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      }, 200);
                    }
                  }}
                  className="bg-heritage-gold`;

content = content.replace(regexBtn, newBtn);

fs.writeFileSync('src/components/HomeView.tsx', content);
