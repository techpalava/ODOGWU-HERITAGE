const fs = require('fs');
let content = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

if (!content.includes('import { AuthorizationEngine }')) {
    content = content.replace('import { Customer } from "../types";', 'import { Customer } from "../types";\nimport { AuthorizationEngine } from "../engine/AuthorizationEngine";');
}

const targetCards = `            <div className="grid grid-cols-1 gap-2.5 max-h-[170px] overflow-y-auto pr-1">
              {accounts.map((profile, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickLogin(profile)}
                  className="w-full text-left p-3 rounded-2xl bg-heritage-cream/50 border border-heritage-gold/15 hover:border-heritage-gold hover:bg-white transition-all group flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-heritage-green/10 border border-heritage-green/20 text-heritage-green flex items-center justify-center group-hover:bg-heritage-green group-hover:text-white transition-colors shrink-0">
                      <User size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-[11px] text-heritage-green font-semibold truncate max-w-[110px]">
                          {profile.name}
                        </strong>
                        <span className="text-[8px] bg-heritage-green/10 text-heritage-green px-1 rounded truncate max-w-[130px]">
                          {profile.email || profile.phone}
                        </span>
                      </div>
                      <p className="text-[9px] text-heritage-ink/60 mt-0.5 font-medium truncate max-w-[180px]">
                        {profile.role}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block text-[8px] font-bold text-heritage-gold uppercase tracking-wider bg-heritage-gold/10 px-2 py-0.5 rounded border border-heritage-gold/20">
                      {profile.orderStatus || "Activated"}
                    </span>
                  </div>
                </button>
              ))}
            </div>`;

const replaceCards = `            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 transition duration-300 py-3 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-sm cursor-pointer mt-2"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>`;

content = content.replace(targetCards, replaceCards);

const handleQuickLoginRegex = /const handleQuickLogin = \(profile: Customer\) => \{[\s\S]*?\}, 600\);\n  \};\n/;

const newGoogleSignIn = `const handleGoogleSignIn = async () => {
    try {
      setError("");
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      let existingAcc = accounts.find(
        (acc) => acc.email.toLowerCase() === (user.email || "").toLowerCase(),
      );

      if (!existingAcc) {
        existingAcc = {
          name: user.displayName || "Google User",
          email: user.email || "",
          phone: user.phoneNumber || "",
          passcode: "1960",
          role: AuthorizationEngine.isAdminEmail(user.email) ? AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR : "Verified Google Client",
          orderStatus: "Fresh Passport Activation",
          method: "gmail",
        } as any;
        const updated = [...accounts, existingAcc];
        setAccounts(updated);
      } else if (AuthorizationEngine.isAdminEmail(user.email)) {
        existingAcc.role = AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR;
      }

      setSuccessMsg(\`Session activated: \${existingAcc.name}\`);
      setTimeout(() => {
        onLogin(existingAcc!.email, existingAcc!.name, existingAcc!.phone);
      }, 600);
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err.message || "Failed to authenticate with Google.");
    }
  };\n\n  `;

content = content.replace(handleQuickLoginRegex, newGoogleSignIn);

fs.writeFileSync('src/components/LoginView.tsx', content);
