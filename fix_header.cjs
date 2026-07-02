const fs = require('fs');
let content = fs.readFileSync('src/components/Header.tsx', 'utf8');
content = content.replace(
  'import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";',
  'import { signOut, onAuthStateChanged } from "firebase/auth";'
);
fs.writeFileSync('src/components/Header.tsx', content);
