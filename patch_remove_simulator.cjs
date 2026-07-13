const fs = require('fs');
let content = fs.readFileSync('src/components/LoginView.tsx', 'utf8');

const simulatorStart = '{/* GOOGLE SIGN IN OAUTH MODAL DIALOG SIMULATOR */}';

let startIndex = content.indexOf(simulatorStart);
if (startIndex !== -1) {
    // Find the end of the AnimatePresence block
    let endToken = '</AnimatePresence>';
    let endIndex = content.indexOf(endToken, startIndex);
    if (endIndex !== -1) {
        let blockToRemove = content.substring(startIndex, endIndex + endToken.length);
        content = content.replace(blockToRemove, '');
    }
}

// Also remove state
const statePattern = /const \[showGoogleDialog, setShowGoogleDialog\] = useState\(false\);\n/;
content = content.replace(statePattern, '');

const statePattern2 = /const \[googleStep, setGoogleStep\] = useState<"select" \| "processing" \| "success">(\n\s*)?\("select"\);\n/;
content = content.replace(statePattern2, '');

const handleGoogleSelectRegex = /const handleGoogleSelect = async \(selectedEmail: string, selectedName: string\) => \{[\s\S]*?\}, 1000\);\n    \} catch \(error\) \{[\s\S]*?\} as any;\n\n        const updated = \[\.\.\.accounts, existingAcc\];\n        setAccounts\(updated\);\n        setGoogleStep\("success"\);\n        setTimeout\(\(\) => \{\n          onLogin\(existingAcc\.email, existingAcc\.name\);\n        \}, 1000\);\n      \}\n    \}\n  \};\n/;

content = content.replace(handleGoogleSelectRegex, '');

fs.writeFileSync('src/components/LoginView.tsx', content);
