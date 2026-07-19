const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `      {/* DESKTOP/TABLET STEPPER (Hidden on mobile) */}
      <div className="hidden md:block bg-white border border-heritage-gold/15 py-3.5 px-5 rounded-2xl shadow-sm select-none">
        <div className="flex justify-between items-end mb-2.5">
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
        <div className="h-1 w-full bg-heritage-cream rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-heritage-gold transition-all duration-300"
            style={{ width: \`\${(currentStep / 9) * 100}%\` }}
          ></div>
        </div>

        {/* Labels row */}
        <div className="flex justify-between items-start text-[10px] uppercase tracking-wider font-semibold">
          {stepTitles.map((_title, idx) => {
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
                className={\`flex flex-col items-start gap-0.5 transition-colors duration-200 focus:outline-none w-14 \${
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
      </div>`;

const desktopStepper = `      {/* DESKTOP/TABLET STEPPER (Hidden on mobile) */}
      <div className="hidden md:block bg-white border border-heritage-gold/15 py-3 px-5 rounded-2xl shadow-sm select-none">
        <div className="flex justify-between items-end mb-2">
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
        <div className="h-[3px] w-full bg-heritage-cream rounded-full overflow-hidden mb-2.5">
          <div
            className="h-full bg-heritage-gold transition-all duration-300"
            style={{ width: \`\${(currentStep / 9) * 100}%\` }}
          ></div>
        </div>

        {/* Labels row */}
        <div className="flex justify-between items-start text-[10px] uppercase tracking-wider font-semibold">
          {stepTitles.map((_title, idx) => {
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
                className={\`flex flex-col items-center sm:items-start gap-0.5 transition-colors duration-200 focus:outline-none w-14 \${
                  isCurrent
                    ? "text-heritage-gold"
                    : isPassed &&
                        !(
                          idx + 1 === 4 &&
                          (localBiometricConsent === "declined" ||
                            storeUser?.biometricConsent?.status === "declined")
                        )
                      ? "text-heritage-green/70 cursor-pointer hover:text-heritage-gold"
                      : "text-heritage-ink/25 cursor-not-allowed"
                }\`}
              >
                <span className={\`font-mono text-[11px] leading-none \${isCurrent ? "font-bold" : "font-medium"}\`}>
                  {idx + 1}
                </span>
                <span className={\`leading-tight text-center sm:text-left text-[9px] \${isCurrent ? "font-bold" : "font-medium"}\`}>
                  {shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>`;

content = content.replace(targetStr, desktopStepper);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
