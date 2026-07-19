const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `  useEffect(() => {
    if (selectedStyle) {
      const defaultGarment = garmentTypesForStyle(selectedStyle)[0];
      if (defaultGarment) {
        setSelectedGarment(defaultGarment);
      }
    } else {
      setSelectedGarment(null);
    }
  }, [selectedStyle]);`;

const replacement = `  useEffect(() => {
    if (selectedStyle) {
      const defaultGarment = garmentTypesForStyle(selectedStyle)[0];
      if (defaultGarment) {
        setSelectedGarment(defaultGarment);
        if (defaultGarment.code === "EXACT" && selectedStyle.defaultGarmentDetails) {
          setDesignSelections(selectedStyle.defaultGarmentDetails);
        }
      }
    } else {
      setSelectedGarment(null);
    }
  }, [selectedStyle]);`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
