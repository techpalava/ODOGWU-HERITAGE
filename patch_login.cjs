const fs = require('fs');
let code = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

// Change grid-cols-3 to grid-cols-2
code = code.replace(/grid grid-cols-3 gap-2 bg-heritage-cream\/30 p-1\.5 rounded-xl border border-heritage-gold\/10/, 'grid grid-cols-2 gap-2 bg-heritage-cream/30 p-1.5 rounded-xl border border-heritage-gold/10');

// Remove the Gmail tab button
const gmailTabRegex = /<button[\s\S]*?onClick=\{\(\) => \{\s*setRegMethod\("gmail"\);\s*setError\(""\);\s*handleGoogleSignIn\(\);\s*\}\}[\s\S]*?<\/button>/;
code = code.replace(gmailTabRegex, '');

// Remove the regMethod === "gmail" block
const gmailBlockRegex = /\{\/\* SUBMODE B: GMAIL SIGN UP \*\/\}\s*\{regMethod === "gmail" && \([\s\S]*?<\/div>\s*\)\}/;
code = code.replace(gmailBlockRegex, '');

// Rename the state
code = code.replace(/useState<"email" \| "gmail" \| "phone">/, 'useState<"email" | "phone">');

// Rename "Gmail Login" text to "Or continue with Google" or similar
code = code.replace(/<span className="flex-shrink mx-3 text-\[9px\] text-heritage-ink\/40 font-bold uppercase tracking-wider">\s*Gmail Login\s*<\/span>/, '<span className="flex-shrink mx-3 text-[9px] text-heritage-ink/40 font-bold uppercase tracking-wider">\n                Or continue with\n              </span>');

fs.writeFileSync('src/components/LoginView.tsx', code);
console.log('Patched');
