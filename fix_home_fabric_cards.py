import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

# Replace the fabric card image rendering
pattern_img = r'\{fabric\.image \? \(\s*<img\s*src=\{fabric\.image\}\s*alt=\{fabric\.name\}\s*loading="lazy"\s*className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-in-out"\s*\/>\s*\) : \(\s*<div className="w-full h-full flex items-center justify-center text-heritage-gold/30">\s*<Sparkles size=\{32\} \/>\s*<\/div>\s*\)\}'

replacement_img = """{fabric.image ? (
                    <img 
                      src={fabric.image} 
                      alt={fabric.name}
                      loading="lazy"
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-in-out"
                    />
                  ) : (
                    <div 
                      className="absolute inset-0 group-hover:scale-105 transition-transform duration-700 ease-in-out"
                      style={{
                        background: `linear-gradient(135deg, ${fabric.colorHex || '#D4AF37'}cc, ${fabric.colorHex || '#D4AF37'}ff)`,
                      }}
                    />
                  )}"""

content = re.sub(pattern_img, replacement_img, content)

# Check if we have the empty state logic
# Find <div className="relative max-w-[100vw] overflow-hidden px-4 sm:px-8">
pattern_container = r'(<div className="relative max-w-\[100vw\] overflow-hidden px-4 sm:px-8">)'
replacement_container = """{activeFabrics.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-heritage-gold/30 rounded-2xl mx-4 sm:mx-8 bg-heritage-cream/10">
            <p className="text-sm text-heritage-ink/60 font-medium">Our fabric collection is being updated. Please visit the Design Studio soon.</p>
          </div>
        ) : (
          <div className="relative max-w-[100vw] overflow-hidden px-4 sm:px-8">"""

content = re.sub(pattern_container, replacement_container, content)

# Close the newly added parenthesis
pattern_end_container = r'(</section>)'
content = re.sub(r'(      </section>)', r'        )}\n      </section>', content)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)

