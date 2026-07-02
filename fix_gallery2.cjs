const fs = require('fs');

let content = fs.readFileSync('src/components/GalleryView.tsx', 'utf8');

// Replace descriptions
const fabricDesc = `<p className="text-heritage-ink/70 max-w-2xl text-sm leading-relaxed mb-6">
                The Avatars represent the current NTCC production batch. Their custom-made traditional garments are presently being designed, tailored in Nigeria, and prepared for shipment to the Netherlands.
              </p>`;
              
const fabricDescNew = `<p className="text-heritage-ink/70 max-w-2xl text-sm leading-relaxed mb-6">
                This group represents one of the latest NTCC production batches. Their custom-made traditional garments are presently being designed, tailored in Nigeria, and prepared for shipment to the Netherlands.
              </p>`;
              
content = content.replace(fabricDesc, fabricDescNew);

const femaleDesc = `<p className="text-heritage-ink/70 max-w-2xl text-sm leading-relaxed mb-6">
                    The Transformers cohort expanded our community...
                  </p>`;

// Actually let's just make sure there's no more "Avatars", "Transformers", "Pioneers", "Executives", "Gladiators" except where appropriate.
// Wait, the descriptions might still have them.
