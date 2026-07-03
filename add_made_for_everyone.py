import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

new_section = """      )}

      {/* Made For Everyone */}
      <section className="space-y-8 py-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
            Made For Everyone
          </h2>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Authentic Nigerian traditional clothing, thoughtfully tailored for individuals, couples, families, and children in our multicultural community.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-4 sm:px-8">
          {[
            {
              icon: "👔",
              title: "Men",
              description: "Traditional attire including Senator wear, Agbada, Isiagu, Kaftans, Shirts, and more.",
            },
            {
              icon: "👗",
              title: "Women",
              description: "Elegant gowns, skirts, blouses, wrappers, dresses, and beautifully tailored traditional outfits.",
            },
            {
              icon: "👨‍👩‍👧‍👦",
              title: "Families & Couples",
              description: "Coordinate matching outfits for weddings, celebrations, cultural events, and family portraits.",
            },
            {
              icon: "🧒",
              title: "Children",
              description: "Traditional clothing specially tailored for children while preserving comfort, style, and authenticity.",
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl p-6 border border-heritage-gold/15 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full group"
            >
              <div className="w-14 h-14 bg-heritage-cream/30 border border-heritage-gold/20 rounded-xl flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                {item.icon}
              </div>
              <h3 className="font-serif font-bold text-heritage-green text-xl mb-3 group-hover:text-heritage-gold transition-colors">
                {item.title}
              </h3>
              <p className="text-sm text-heritage-ink/70 leading-relaxed font-sans">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center pt-6">
          <button
            onClick={() => {
              if (currentUser) {
                onStartDesigning();
              } else {
                onNavigateToTab("login");
              }
            }}
            className="inline-flex bg-heritage-gold text-heritage-forest hover:bg-heritage-green hover:text-white px-8 py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-md items-center gap-2 cursor-pointer"
          >
            Design Your Outfit <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* How It Works (Tailoring Journey) */}"""

content = content.replace("      )}\n\n      {/* How It Works (Tailoring Journey) */}", new_section)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)
