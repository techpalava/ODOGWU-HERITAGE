const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

code = code.replace(
    '              <>\n                <p className="text-sm opacity-80 mb-4">{journey.notification}</p>',
    '            {journey.requiresAttention && (\n              <>\n                <p className="text-sm opacity-80 mb-4">{journey.notification}</p>'
);

code = code.replace(
    '              </>\n                      </div>\n        </div>\n      </section>',
    '              </>\n            )}\n          </div>\n        </div>\n      </section>'
);

fs.writeFileSync('src/components/DashboardView.tsx', code);
