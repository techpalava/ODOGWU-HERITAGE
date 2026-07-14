const fs = require('fs');

let code = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

const anchor = `        {/* Dual Mode Tab Selector */}
        <div className="flex border-b border-gray-100 bg-heritage-cream/10">`;

const missingCode = `
          <button
            type="button"
            onClick={() => {
              setActiveMode("login");
              setError("");
            }}
            className={\`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 \${
              activeMode === "login"
                ? "bg-white text-heritage-green border-b-2 border-heritage-gold"
                : "text-heritage-ink/50 hover:text-heritage-green hover:bg-white/50"
            }\`}
          >
            <Lock size={14} /> Log In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode("register");
              setError("");
            }}
            className={\`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 \${
              activeMode === "register"
                ? "bg-white text-heritage-green border-b-2 border-heritage-gold"
                : "text-heritage-ink/50 hover:text-heritage-green hover:bg-white/50"
            }\`}
          >
            <User size={14} /> Create Account
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-6 p-3 bg-red-50 text-red-700 text-[10px] uppercase font-bold tracking-wider rounded-xl border border-red-200 flex items-start gap-2">
              <span className="mt-0.5"><XCircle size={14} /></span>
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-3 bg-green-50 text-green-700 text-[10px] uppercase font-bold tracking-wider rounded-xl border border-green-200 flex items-start gap-2">
              <span className="mt-0.5"><CheckCircle2 size={14} /></span>
              <span className="flex-1 leading-snug">{successMsg}</span>
            </div>
          )}

          {/* MODE 1: LOGIN */}
          {activeMode === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/30">
                    <Mail size={14} />
                  </div>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="johndoe@gmail.com"
                    className="block w-full pl-10 pr-4 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                    Security PIN
                  </label>
                  <span className="text-[9px] text-heritage-gold hover:text-heritage-green cursor-pointer transition-colors">
                    Forgot PIN?
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/30">
                    <Lock size={14} />
                  </div>
                  <input
                    type="password"
                    maxLength={4}
                    value={loginPasscode}
                    onChange={(e) =>
                      setLoginPasscode(e.target.value.replace(/\\D/g, ""))
                    }
                    placeholder="••••"
                    className="block w-full pl-10 pr-4 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink font-mono tracking-widest font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-2 bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition duration-300 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                Sign In <ArrowRight size={12} />
              </button>
            </form>
          )}

          {/* MODE 2: CREATE ACCOUNT */}
          {activeMode === "register" && (
            <div className="space-y-5">
              {/* Two Sub-Methods Tab Heads */}
              <div className="grid grid-cols-2 gap-2 bg-heritage-cream/30 p-1.5 rounded-xl border border-heritage-gold/10">
                <button
                  type="button"
                  onClick={() => {
                    setRegMethod("email");
                    setError("");
                  }}
                  className={\`py-2 text-[10px] uppercase font-bold tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 \${
                    regMethod === "email"
                      ? "bg-white text-heritage-green shadow-sm border border-heritage-gold/25"
                      : "text-heritage-ink/65 hover:text-heritage-ink"
                  }\`}
                >
                  <Mail size={12} /> Email
                </button>
`;

code = code.replace(anchor, anchor + missingCode);
fs.writeFileSync('src/components/LoginView.tsx', code);
console.log('Reconstructed');
