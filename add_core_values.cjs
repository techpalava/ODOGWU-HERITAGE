const fs = require('fs');

const file = 'src/components/AboutView.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add Scissors to imports
content = content.replace(
  'Handshake,',
  'Handshake,\n  Scissors,'
);

// Find the Mission & Vision grid closing tag
const insertPoint = `          <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-heritage-green uppercase tracking-wider font-bold">
            <span>Supporting Artisans</span>
            <ArrowUpRight size={14} />
          </div>
        </motion.div>
      </div>`;

const newSection = `
      {/* Core Values Section */}
      <motion.section
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="rounded-3xl border border-heritage-gold/20 bg-white p-6 sm:p-10 shadow-sm space-y-10 text-left"
      >
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <h2 className="text-2xl sm:text-3xl font-serif text-heritage-green font-bold">
            Core Values
          </h2>
          <p className="text-xs sm:text-sm text-heritage-ink/80 leading-relaxed font-sans">
            The principles that unite our multicultural community and guide everything we do.
          </p>
          <div className="w-16 h-[2px] bg-heritage-gold mx-auto"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Featured Content */}
          <div className="lg:col-span-5 bg-heritage-cream/40 border border-heritage-gold/15 rounded-3xl p-8 space-y-6 h-full">
            <h3 className="text-xl font-serif font-bold text-heritage-green leading-snug">
              Celebrating Culture Through Unity
            </h3>
            <div className="space-y-4 text-xs sm:text-sm text-heritage-ink/80 leading-relaxed font-sans">
              <p>
                The Nigerian Traditional Clothing Community (NTCC) brings people from different backgrounds together through the beauty of authentic Nigerian traditional clothing.
              </p>
              <p>
                Our mission goes beyond fashion. We celebrate cultural diversity, preserve traditional craftsmanship, and create meaningful connections by making handcrafted Nigerian garments accessible to our multicultural community in the Netherlands.
              </p>
              <p>
                Through every outfit, we encourage appreciation, understanding, and respect for one another's cultures while supporting skilled artisans in Nigeria and preserving generations of tailoring excellence.
              </p>
            </div>
          </div>

          {/* Value Cards */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Cultural Diversity */}
            <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-4">
              <div className="h-10 w-10 bg-heritage-green/10 text-heritage-green rounded-xl flex items-center justify-center border border-heritage-green/20">
                <Globe size={20} />
              </div>
              <h4 className="font-serif font-bold text-heritage-green text-base">Cultural Diversity</h4>
              <p className="text-xs text-heritage-ink/75 leading-relaxed font-sans">
                Celebrating the richness and uniqueness of every culture.
              </p>
            </div>
            
            {/* Inclusion */}
            <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-4">
              <div className="h-10 w-10 bg-heritage-gold/10 text-heritage-gold rounded-xl flex items-center justify-center border border-heritage-gold/20">
                <Handshake size={20} />
              </div>
              <h4 className="font-serif font-bold text-heritage-green text-base">Inclusion</h4>
              <p className="text-xs text-heritage-ink/75 leading-relaxed font-sans">
                Creating a welcoming community where everyone feels valued and respected.
              </p>
            </div>

            {/* Authentic Craftsmanship */}
            <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-4">
              <div className="h-10 w-10 bg-heritage-ink/5 text-heritage-ink rounded-xl flex items-center justify-center border border-heritage-ink/10">
                <Scissors size={20} />
              </div>
              <h4 className="font-serif font-bold text-heritage-green text-base">Authentic Craftsmanship</h4>
              <p className="text-xs text-heritage-ink/75 leading-relaxed font-sans">
                Supporting skilled Nigerian artisans while preserving traditional tailoring techniques.
              </p>
            </div>

            {/* Mutual Respect */}
            <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-4">
              <div className="h-10 w-10 bg-heritage-green/10 text-heritage-green rounded-xl flex items-center justify-center border border-heritage-green/20">
                <Heart size={20} />
              </div>
              <h4 className="font-serif font-bold text-heritage-green text-base">Mutual Respect</h4>
              <p className="text-xs text-heritage-ink/75 leading-relaxed font-sans">
                Building stronger communities through cultural appreciation, understanding, and shared experiences.
              </p>
            </div>
          </div>
        </div>
      </motion.section>`;

content = content.replace(insertPoint, insertPoint + newSection);

fs.writeFileSync(file, content);
console.log('Added Core Values section');
