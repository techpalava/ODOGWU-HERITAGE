const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = content;
    for (const [search, replace] of replacements) {
        modified = modified.replace(search, replace);
    }
    if (modified !== content) {
        fs.writeFileSync(filePath, modified);
        console.log('Modified', filePath);
    }
}

// 1. App.tsx
replaceInFile('src/App.tsx', [
    [/openBatch.pickupLocation \|\| "ASML Veldhoven Campus Lockers"/g, 'openBatch.pickupLocation || businessSettings.productionSettings.defaultPickupLocation || "Veldhoven Campus Lockers"'],
    [/ASML Veldhoven Campus Campus-Escrow Pipeline/g, 'Campus-Escrow Pipeline']
]);

// 2. src/components/AboutView.tsx
replaceInFile('src/components/AboutView.tsx', [
    [/the Nigerian Traditional Clothing Community \(NTCC\) at ASML/g, '{businessSettings.applicationSettings.communityName}'],
    [/Founder & ASML Coordinator/g, 'Founder & Coordinator'],
    [/Active ASML group cohort members/g, 'Active group cohort members'],
    [/ASML Veldhoven/g, 'Veldhoven'],
    [/Building a Culturally Inclusive ASML/g, 'Building a Culturally Inclusive Community'],
    [/spread it across ASML, the/g, 'spread it across our community, the'],
    [/surprise our ASML CEO/g, 'surprise our CEO'],
    [/cultural pride at ASML\./g, 'cultural pride in our community.'],
    [/traditional clothing with more ASML/g, 'traditional clothing with more community'],
    [/ASML CEO Christophe Fouquet Gifting/g, 'CEO Gifting'],
    [/Gifting a traditional custom-tailored shirt to ASML CEO/g, 'Gifting a traditional custom-tailored shirt to our CEO']
]);

// 3. src/components/LoginView.tsx
replaceInFile('src/components/LoginView.tsx', [
    [/ASML Bespoke digital passport\./g, 'Bespoke digital passport.'],
    [/ASML Tailoring Spec Office/g, 'Tailoring Spec Office'],
    [/ASML Corp\./g, 'the Corporation'],
    [/ASML digital passport/g, 'Digital passport']
]);

// 4. src/components/MobileMenu.tsx
replaceInFile('src/components/MobileMenu.tsx', [
    [/Connecting Lagos ateliers with ASML Veldhoven\./g, 'Connecting Lagos ateliers with {businessSettings.applicationSettings.communityName}.']
]);

// 5. src/components/HomeView.tsx
replaceInFile('src/components/HomeView.tsx', [
    [/Welcome to the Traditional Clothing Community at ASML\./g, 'Welcome to {businessSettings.applicationSettings.communityName}.'],
    [/Welcome to the ASML Traditional Clothing Community\./g, 'Welcome to {businessSettings.applicationSettings.communityName}.'],
    [/delivered directly to the ASML campus in Veldhoven is/g, 'delivered directly to {businessSettings.productionSettings.defaultPickupLocation} is'],
    [/ASML Senior Engineer/g, 'Senior Engineer']
]);

// 6. src/components/Header.tsx
replaceInFile('src/components/Header.tsx', [
    [/Nigerian Traditional Clothing Community at ASML/g, '{businessSettings.applicationSettings.communityName}']
]);

// 7. src/components/GalleryView.tsx
replaceInFile('src/components/GalleryView.tsx', [
    [/across ASML\./g, 'across the community.']
]);

// 8. src/components/Footer.tsx
replaceInFile('src/components/Footer.tsx', [
    [/"Nigerian Traditional Clothing Community at ASML"/g, 'businessSettings.applicationSettings.communityName'],
    [/"The Nigerian Traditional Clothing Community at ASML, connecting skilled artisans in Nigeria with communities across the Netherlands through premium custom-made traditional clothing\."/g, 'businessSettings.applicationSettings.description || "Connecting skilled artisans with communities through premium custom-made traditional clothing."'],
    [/"ASML Veldhoven Campus, Netherlands"/g, 'businessSettings.productionSettings.defaultPickupLocation']
]);

// 9. src/components/DashboardView.tsx
replaceInFile('src/components/DashboardView.tsx', [
    [/ASML Veldhoven Traditional Clothing Member\./g, '{businessSettings.applicationSettings.communityName} Member.'],
    [/loc: "ASML Veldhoven \(NL\)",/g, 'loc: businessSettings.productionSettings.defaultPickupLocation,'],
    [/ASML Email Tracking Active:/g, 'Corporate Email Tracking Active:'],
    [/ASML Building 4, Ground Level East Wing/g, '{businessSettings.productionSettings.defaultPickupLocation}'],
    [/ASML Email/g, 'Corporate Email'],
    [/> ASML/g, '> {businessSettings.productionSettings.defaultPickupLocation}'],
    [/ASML Veldhoven Chapter — Est\. 2024/g, '{businessSettings.applicationSettings.communityName} — Est. 2024'],
    [/ASML Veldhoven Campus Delivery/g, '{businessSettings.productionSettings.defaultPickupLocation} Delivery'],
    [/"ASML Building 4 Ground level"/g, 'businessSettings.productionSettings.defaultPickupLocation']
]);

// 10. src/components/DesignStudioView.tsx
replaceInFile('src/components/DesignStudioView.tsx', [
    [/ASML Veldhoven Campus Lockers/g, 'Veldhoven Campus Lockers'],
    [/ASML corporate email/g, 'corporate email'],
    [/ASML Building 4 Veldhoven Locker/g, 'Veldhoven Locker'],
    [/ASML Veldhoven Lockers, Veldhoven, NL/g, 'Veldhoven Lockers, Veldhoven, NL'],
    [/ASML ASML Email/g, 'Corporate Email'],
    [/ASML Mail:/g, 'Corporate Mail:'],
    [/ASML campus/g, 'campus']
]);
replaceInFile('src/components/DesignStudioView.tsx', [
    [/computedActiveBatch\.pickupLocation \|\| "Veldhoven Campus Lockers"/g, 'computedActiveBatch.pickupLocation || businessSettings.productionSettings.defaultPickupLocation'],
    [/pickupLocation: "Veldhoven Campus Lockers"/g, 'pickupLocation: businessSettings.productionSettings.defaultPickupLocation'],
    [/`Veldhoven Locker \(Pickup: \$\{pickupTime\}\)`/g, '`${businessSettings.productionSettings.defaultPickupLocation} (Pickup: ${pickupTime})`'],
    [/"Veldhoven Lockers, Veldhoven, NL"/g, 'businessSettings.productionSettings.defaultPickupLocation']
]);

// 11. src/components/CustomOrderView.tsx
replaceInFile('src/components/CustomOrderView.tsx', [
    [/"ASML Veldhoven"/g, 'businessSettings.productionSettings.defaultPickupLocation']
]);

// 12. src/components/DatabaseView.tsx
replaceInFile('src/components/DatabaseView.tsx', [
    [/"ASML Building 4 Veldhoven"/g, 'businessSettings.productionSettings.defaultPickupLocation'],
    [/"e\.g\. ASML Veldhoven Building 4 Lockers"/g, '`e.g. ${businessSettings.productionSettings.defaultPickupLocation}`'],
    [/"Arrived at ASML Veldhoven Locker Hub\. Ready for secure PIN pickup!"/g, '`Arrived at ${businessSettings.productionSettings.defaultPickupLocation}. Ready for secure PIN pickup!`'],
    [/Arrived in ASML Veldhoven Locker!/g, 'Arrived at Pickup Location!'],
    [/"ASML Veldhoven Building 4"/g, 'businessSettings.productionSettings.defaultPickupLocation'],
    [/"ASML Veldhoven Campus"/g, 'businessSettings.productionSettings.defaultPickupLocation'],
    [/"ASML Veldhoven"/g, 'businessSettings.productionSettings.defaultPickupLocation'],
    [/VIP and ASML/g, 'VIP and Corporate']
]);

// 13. src/data/mockData.ts
replaceInFile('src/data/mockData.ts', [
    [/"ASML Veldhoven Lockers"/g, '"Veldhoven Campus Lockers"'],
    [/"ASML Veldhoven Campus"/g, '"Veldhoven Campus Lockers"']
]);

// 14. src/types.ts
replaceInFile('src/types.ts', [
    [/"ASML Building 4 Veldhoven"/g, '"Veldhoven Campus Lockers"']
]);

console.log('Script completed');
