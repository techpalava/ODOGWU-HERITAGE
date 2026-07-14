const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const targetStr = `                <DesignStudioView
                  onAddToCart={handleAddToCart}
                  onNavigateToTab={(
                    tabId:
                      | "home"
                      | "design"
                      | "dashboard"
                      | "about"
                      | "gallery"
                      | "database"
                      | "custom-order"
                      | "login",
                  ) => setActiveTab(tabId)}
                  openCartDrawer={() => setIsCartOpen(true)}`;

const replaceStr = `                <DesignStudioView
                  onAddToCart={handleAddToCart}
                  openCartDrawer={() => setIsCartOpen(true)}`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync('src/App.tsx', code);
    console.log('Fixed App.tsx');
} else {
    console.log('Target string not found in App.tsx');
}
