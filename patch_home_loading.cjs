const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

// 1. Add isLoadingData to destructuring
content = content.replace(
  'const { businessSettings,',
  'const { isLoadingData, businessSettings,'
);

// 2. Wrap the buttons
const buttonsTarget = `<div className="flex flex-wrap gap-4 pt-4">`;
const buttonsReplacement = `<div className="flex flex-wrap gap-4 pt-4">
              {isLoadingData ? (
                <>
                  <div className="w-full sm:w-32 h-11 bg-white/10 rounded-xl animate-pulse" />
                  <div className="w-full sm:w-32 h-11 bg-white/10 rounded-xl animate-pulse" />
                </>
              ) : (
                <>`;

content = content.replace(buttonsTarget, buttonsReplacement);

const buttonsEndTarget = `              </button>
            </div>`;
const buttonsEndReplacement = `              </button>
              </>)}
            </div>`;

content = content.replace(buttonsEndTarget, buttonsEndReplacement);

// 3. Wrap the group status card
const statusTarget = `<div className="rounded-2xl border border-heritage-gold/30 bg-heritage-forest p-6 space-y-5 shadow-xl">`;
const statusReplacement = `{isLoadingData ? (
              <div className="rounded-2xl border border-heritage-gold/30 bg-heritage-forest/50 p-6 space-y-5 shadow-xl h-[240px] animate-pulse" />
            ) : (
              <div className="rounded-2xl border border-heritage-gold/30 bg-heritage-forest p-6 space-y-5 shadow-xl">`;

content = content.replace(statusTarget, statusReplacement);

const statusEndTarget = `            </div>
          </div>{" "}
          {/* Why Heritage Box */}`;
const statusEndReplacement = `            </div>
            )}
          </div>{" "}
          {/* Why Heritage Box */}`;

content = content.replace(statusEndTarget, statusEndReplacement);


fs.writeFileSync('src/components/HomeView.tsx', content);
