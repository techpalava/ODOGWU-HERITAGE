const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const target = `              })()}
            </div>
          </div>
        </div>
      </section>
      {/* Why Choose NTCC? */}`;

const replacement = `              })()}
            </div>
            )}
          </div>
        </div>
      </section>
      {/* Why Choose NTCC? */}`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/HomeView.tsx', content);
