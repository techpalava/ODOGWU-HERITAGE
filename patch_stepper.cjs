const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `      <div className="bg-white border border-heritage-gold/15 p-4 rounded-3xl shadow-sm space-y-3 select-none">
        <div className="flex flex-col sm:flex-row sm:justify-between items-center`;

const desktopStepper = `
      {/* DESKTOP/TABLET STEPPER (Hidden on mobile) */}
      <div className="hidden md:block bg-white border border-heritage-gold/15 p-4 sm:p-5 rounded-2xl shadow-sm select-none">
        <div className="flex justify-between items-end mb-3">
          <div className="text-heritage-green font-bold text-sm">
            Step {currentStep} of 9:{" "}
            <span className="text-heritage-gold font-serif ml-1">
              {stepTitles[currentStep - 1]}
            </span>
          </div>
          <div className="font-mono text-heritage-ink/50 text-[11px] font-bold">
            {Math.round((currentStep / 9) * 100)}% Complete
          </div>
        </div>

        {/* Dynamic bar */}
        <div className="h-1 w-full bg-heritage-cream rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-heritage-gold transition-all duration-300"
            style={{ width: \`\${(currentStep / 9) * 100}%\` }}
          ></div>
        </div>

        {/* Labels row */}
        <div className="flex justify-between items-start text-[10px] uppercase tracking-wider font-semibold">
          {stepTitles.map((title, idx) => {
            const isPassed = idx + 1 < currentStep;
            const isCurrent = idx + 1 === currentStep;
            const shortLabels = ["Fabric", "Style", "Accents", "Try-On", "Sizing", "Dims", "Delivery", "Notes", "Review"];
            const shortLabel = shortLabels[idx];
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (isPassed) {
                    const targetStep = idx + 1;
                    if (
                      targetStep === 4 &&
                      (localBiometricConsent === "declined" ||
                        storeUser?.biometricConsent?.status === "declined")
                    ) {
                      return;
                    }
                    setCurrentStep(targetStep);
                    setValidationError("");
                  }
                }}
                disabled={
                  !isPassed ||
                  (idx + 1 === 4 &&
                    (localBiometricConsent === "declined" ||
                      storeUser?.biometricConsent?.status === "declined"))
                }
                className={\`flex flex-col items-start gap-1 transition-colors duration-200 focus:outline-none w-14 \${
                  isCurrent
                    ? "text-heritage-gold"
                    : isPassed &&
                        !(
                          idx + 1 === 4 &&
                          (localBiometricConsent === "declined" ||
                            storeUser?.biometricConsent?.status === "declined")
                        )
                      ? "text-heritage-green cursor-pointer hover:text-heritage-gold"
                      : "text-heritage-ink/30 cursor-not-allowed"
                }\`}
              >
                <span className={\`font-mono text-xs leading-none \${isCurrent ? "font-bold" : ""}\`}>
                  {idx + 1}
                </span>
                <span className={\`leading-tight text-left \${isCurrent ? "font-bold" : ""}\`}>
                  {shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
`;

content = content.replace(targetStr, `      {/* MOBILE STEPPER (Hidden on md and up) */}\n      <div className="md:hidden bg-white border border-heritage-gold/15 p-4 rounded-3xl shadow-sm space-y-3 select-none">\n        <div className="flex flex-col sm:flex-row sm:justify-between items-center`);

const closingTags = `                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-heritage-green"></div>
                </div>
              </button>
            );
          })}
        </div>
      </div>`;

content = content.replace(closingTags, closingTags + "\n" + desktopStepper);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
