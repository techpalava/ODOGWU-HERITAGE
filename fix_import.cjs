const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace("import { GARMENT_DETAIL_OPTIONS, SelectionGroup } from '../config/GarmentDetailsConfig';\n\nconst GarmentDetailSelector = ({", "const GarmentDetailSelector = ({");

content = "import { GARMENT_DETAIL_OPTIONS, SelectionGroup } from '../config/GarmentDetailsConfig';\n" + content;

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
