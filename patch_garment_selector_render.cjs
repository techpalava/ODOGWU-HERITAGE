const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `  return (
    <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
      {(isMale || isFamily) && isShirt && (
        <>
          {renderGroup("Top Length", "topLength", GARMENT_DETAIL_PRICING.topLength)}
          {renderGroup("Top Pocket", "topPocket", GARMENT_DETAIL_PRICING.topPocket)}
        </>
      )}
      {(isFemale || isFamily) && isDress && (
        <>
          {renderGroup("Dress Length", "dressLength", GARMENT_DETAIL_PRICING.dressLength)}
          {renderGroup("Dress Pocket", "dressPocket", GARMENT_DETAIL_PRICING.dressPocket)}
        </>
      )}
      {(isFemale || isFamily) && isSkirt && (
        <>
          {renderGroup("Skirt Length", "skirtLength", GARMENT_DETAIL_PRICING.skirtLength)}
          {renderGroup("Skirt Pocket", "skirtPocket", GARMENT_DETAIL_PRICING.skirtPocket)}
        </>
      )}
      {(isShirt || isDress) && (
        <>
          {renderGroup("Sleeve Length", "sleeveLength", GARMENT_DETAIL_PRICING.sleeveLength)}
        </>
      )}
      {isTrouser && (
        <>
          {renderGroup("Trouser Fastening", "trouserFastening", GARMENT_DETAIL_PRICING.trouserFastening)}
          {renderGroup("Trouser Pocket", "trouserPocket", GARMENT_DETAIL_PRICING.trouserPocket)}
        </>
      )}
      {isShorts && (
        <>
          {renderGroup("Short Fastening", "shortFastening", GARMENT_DETAIL_PRICING.shortFastening)}
          {renderGroup("Short Pocket", "shortPocket", GARMENT_DETAIL_PRICING.shortPocket)}
        </>
      )}
      {renderGroup("Monogram & Embroidery", "embroideryDesign", GARMENT_DETAIL_PRICING.embroideryDesign)}
      {renderGroup("Accessories", "accessories", GARMENT_DETAIL_PRICING.accessories, true)}
      
      {isLiningSupported && (
        <div className="space-y-2 mb-4 col-span-1 md:col-span-2">`;

const replacement = `  return (
    <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
      {(isMale || isFamily) && isShirt && (
        <>
          {renderGroup("Top Length", "topLength", GARMENT_DETAIL_PRICING.topLength)}
          {showPockets && renderGroup("Top Pocket", "topPocket", GARMENT_DETAIL_PRICING.topPocket)}
        </>
      )}
      {(isFemale || isFamily) && showDress && (
        <>
          {renderGroup("Dress Length", "dressLength", GARMENT_DETAIL_PRICING.dressLength)}
          {showPockets && renderGroup("Dress Pocket", "dressPocket", GARMENT_DETAIL_PRICING.dressPocket)}
        </>
      )}
      {(isFemale || isFamily) && showSkirt && (
        <>
          {renderGroup("Skirt Length", "skirtLength", GARMENT_DETAIL_PRICING.skirtLength)}
          {showPockets && renderGroup("Skirt Pocket", "skirtPocket", GARMENT_DETAIL_PRICING.skirtPocket)}
        </>
      )}
      {showSleeves && (
        <>
          {renderGroup("Sleeve Length", "sleeveLength", GARMENT_DETAIL_PRICING.sleeveLength)}
        </>
      )}
      {showTrousers && (
        <>
          {renderGroup("Trouser Fastening", "trouserFastening", GARMENT_DETAIL_PRICING.trouserFastening)}
          {showPockets && renderGroup("Trouser Pocket", "trouserPocket", GARMENT_DETAIL_PRICING.trouserPocket)}
        </>
      )}
      {showShorts && (
        <>
          {renderGroup("Short Fastening", "shortFastening", GARMENT_DETAIL_PRICING.shortFastening)}
          {showPockets && renderGroup("Short Pocket", "shortPocket", GARMENT_DETAIL_PRICING.shortPocket)}
        </>
      )}
      {showEmbroidery && renderGroup("Monogram & Embroidery", "embroideryDesign", GARMENT_DETAIL_PRICING.embroideryDesign)}
      {showAccessories && renderGroup("Accessories", "accessories", GARMENT_DETAIL_PRICING.accessories, true)}
      
      {showLining && (
        <div className="space-y-2 mb-4 col-span-1 md:col-span-2">`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
