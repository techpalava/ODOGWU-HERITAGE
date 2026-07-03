import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

# Make sure currentUser is available
if 'currentUser' not in content.split('useAppStore();')[0].split('const {')[1]:
    content = content.replace('const { businessSettings } = useAppStore();', 'const { businessSettings, currentUser } = useAppStore();')

how_it_works = """
      {/* How It Works (Tailoring Journey) */}
      <section className="space-y-8 py-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
            How It Works
          </h2>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            From your design ideas to a beautifully tailored outfit delivered to the Netherlands.
          </p>
        </div>

        <div className="relative">
          {/* Connecting Line for Desktop */}
          <div className="hidden lg:block absolute top-[50px] left-[10%] right-[10%] h-[2px] bg-heritage-gold/20"></div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 relative z-10">
            {[
              {
                icon: "🎨",
                title: "Choose Your Style",
                description: "Browse our collection of traditional Nigerian clothing and select the design that best matches your preferences.",
              },
              {
                icon: "🧵",
                title: "Select Your Fabric",
                description: "Choose from our carefully curated collection of authentic premium fabrics to create your unique outfit.",
              },
              {
                icon: "📏",
                title: "Submit Your Measurements",
                description: "Provide your measurements or use your saved profile to ensure a comfortable and accurate fit.",
              },
              {
                icon: "✂️",
                title: "Tailored in Nigeria",
                description: "Experienced Nigerian artisans carefully handcraft your outfit using traditional tailoring techniques and premium craftsmanship.",
              },
              {
                icon: "📦",
                title: "Shipped to the Netherlands",
                description: "After quality inspection, your finished outfit is securely packaged and shipped to the Netherlands with your batch delivery.",
              },
              {
                icon: "✨",
                title: "Enjoy Your Outfit",
                description: "Receive your custom-made Nigerian attire and celebrate culture through exceptional craftsmanship and timeless style.",
              }
            ].map((step, index) => (
              <div key={index} className="flex flex-col items-center text-center space-y-4 group">
                <div className="w-24 h-24 sm:w-20 sm:h-20 bg-white border-2 border-heritage-gold/20 rounded-full flex items-center justify-center text-4xl shadow-md group-hover:scale-110 group-hover:border-heritage-gold/50 transition-all duration-300 relative bg-heritage-cream/10 z-10">
                  {step.icon}
                </div>
                <div className="space-y-2">
                  <h3 className="font-serif font-bold text-heritage-green text-sm lg:text-base leading-tight">
                    {step.title}
                  </h3>
                  <p className="text-xs text-heritage-ink/75 leading-relaxed hidden sm:block">
                    {step.description}
                  </p>
                  <p className="text-sm text-heritage-ink/75 leading-relaxed block sm:hidden">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Optional Trust Badges */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8 pt-8 border-t border-heritage-gold/15">
          <div className="flex items-center gap-2 text-xs text-heritage-green font-medium">
            <ShieldCheck size={16} className="text-heritage-gold" />
            <span>Authentic Nigerian Craftsmanship</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-heritage-green font-medium">
            <ShieldCheck size={16} className="text-heritage-gold" />
            <span>Secure Batch Delivery</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-heritage-green font-medium">
            <ShieldCheck size={16} className="text-heritage-gold" />
            <span>Custom Made for Every Customer</span>
          </div>
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
            className="inline-flex bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest px-8 py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-md items-center gap-2"
          >
            Start Designing Your Outfit <ArrowRight size={14} />
          </button>
        </div>
      </section>
"""

# Insert before Community Photo Gallery Showcase
pattern = r'(      {\/\* Community Photo Gallery Showcase \*\/})'
content = re.sub(pattern, how_it_works + r'\n\1', content)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)

