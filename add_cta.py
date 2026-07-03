import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

cta_section = """
      {/* Final Call to Action Section */}
      <section className="relative overflow-hidden rounded-3xl bg-heritage-green p-8 sm:p-12 lg:p-16 text-white shadow-2xl border border-heritage-gold/20 text-center mx-auto mb-8">
        <div className="absolute -left-24 -top-24 w-96 h-96 rounded-full border border-heritage-gold/10 pointer-events-none"></div>
        <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full border border-heritage-gold/10 pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-9xl text-heritage-gold/5 pointer-events-none font-serif select-none">
          ⚜
        </div>
        
        <div className="relative z-10 space-y-8 max-w-3xl mx-auto">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold tracking-tight text-white leading-tight">
              Ready to Design Your Custom Outfit?
            </h2>
            <div className="space-y-3 text-sm text-heritage-beige max-w-2xl mx-auto leading-relaxed">
              <p>
                Experience authentic Nigerian traditional clothing, handcrafted by skilled artisans in Nigeria and custom-made to your preferences.
              </p>
              <p>
                Every outfit is created with exceptional craftsmanship and carefully delivered to our community in the Netherlands.
              </p>
              <p>
                Whether you're celebrating your heritage, attending a cultural event, or simply appreciating beautiful craftsmanship, your custom outfit begins here.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-heritage-beige/90 py-4 font-medium">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-heritage-gold" />
              <span>Handcrafted in Nigeria</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-heritage-gold" />
              <span>Custom Made for Every Customer</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-heritage-gold" />
              <span>Secure Delivery to the Netherlands</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-heritage-gold" />
              <span>Authentic Traditional Craftsmanship</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <button
              onClick={onStartDesigning}
              className="w-full sm:w-auto bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green px-8 py-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-xl inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              Start Designing <ArrowRight size={14} />
            </button>
            <button
              onClick={() => onNavigateToTab("gallery")}
              className="w-full sm:w-auto border border-heritage-gold/50 text-heritage-gold hover:bg-heritage-gold/10 transition duration-300 px-8 py-4 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer"
            >
              Browse Gallery
            </button>
          </div>
        </div>
      </section>
"""

# Insert before closing div
content = content.replace('    </div>\n  );\n}', cta_section + '    </div>\n  );\n}')

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)
