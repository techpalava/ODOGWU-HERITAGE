const fs = require('fs');
let content = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

// Replace the setShowGoogleDialog calls with handleGoogleSignIn
content = content.replace(/setShowGoogleDialog\(true\);\s*setGoogleStep\("select"\);/g, 'handleGoogleSignIn();');

// Remove customGoogleEmail and googleStep
content = content.replace(/const \[customGoogleEmail, setCustomGoogleEmail\] = useState\(""\);\n/, '');
content = content.replace(/const \[googleStep\] = useState<"select" \| "processing" \| "success">\("select"\);\n/, ''); // Wait, the previous patch might have removed the setter, let's just remove anything matching `googleStep`
content = content.replace(/const \[googleStep.*?;\n/, '');

// Remove handleGoogleSelect function entirely
const handleGoogleSelectRegex = /\/\/ Complete Google Account Creation\n\s*const handleGoogleSelect = async \(selectedEmail: string, selectedName: string\) => \{[\s\S]*?\}, 1000\);\n\s*\}\n\s*\} catch \(error\) \{[\s\S]*?\} as any;\n\n\s*const updated = \[\.\.\.accounts, existingAcc\];\n\s*setAccounts\(updated\);\n\s*setGoogleStep\("success"\);\n\s*setTimeout\(\(\) => \{\n\s*onLogin\(existingAcc!\.email, existingAcc!\.name, existingAcc!\.phone\);\n\s*\}, 1000\);\n\s*\}\n\s*\}\n\s*};\n/;
// The above regex might be tricky, let's just use string replacement with indices if regex fails.
