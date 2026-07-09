const fs = require('fs');

let content = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// Add imports
content = content.replace(
  'import { Edit2, Users, User, Share2, Trash2, CheckCircle2, FileText, Check, Shield, X } from "lucide-react";',
  'import { Edit2, Users, User, Share2, Trash2, CheckCircle2, FileText, Check, Shield, X, CreditCard, Mail, Printer } from "lucide-react";\nimport { useAppStore } from "../store/useAppStore";'
);

// Add missing constants inside the component
content = content.replace(
  'const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);',
  `const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const { businessSettings } = useAppStore();
  const profileName = currentUser?.name || "Guest";
  const profileEmail = currentUser?.email || "guest@example.com";
  const profilePhone = currentUser?.phone || "+1234567890";`
);

fs.writeFileSync('src/components/DashboardView.tsx', content);
