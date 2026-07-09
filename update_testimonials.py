import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

old_block = """      {/* Community Testimonials */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <span className="text-xs font-bold text-heritage-gold tracking-widest uppercase block">
            Reviews
          </span>
          <h3 className="text-2xl sm:text-3xl font-serif text-heritage-green font-semibold">
            What our colleagues say
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "The fit is perfect. Ordering custom clothes from Lagos and
              getting them delivered directly to{" "}
              {businessSettings.productionSettings.defaultPickupLocation} is
              super easy and convenient. I love wearing my Senator shirt on
              Mondays."
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-green text-white font-serif flex items-center justify-center text-xs font-bold">
                AO
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Amadi O.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  Senior Engineer, Eindhoven
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "My Royal Senator suit fits exactly as estimated. The process was
              very simple, and my colleagues love the design!"
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-gold text-heritage-green font-serif flex items-center justify-center text-xs font-bold">
                FE
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Fredrick E.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  Veldhoven HQ Staff
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>"""

new_block = """      {/* Community Testimonials */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <span className="text-xs font-bold text-heritage-gold tracking-widest uppercase block">
            Reviews
          </span>
          <h3 className="text-2xl sm:text-3xl font-serif text-heritage-green font-semibold">
            What our colleagues say
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between h-full">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "The fit is perfect. Ordering custom clothes from Lagos and
              getting them delivered directly to{" "}
              {businessSettings.productionSettings.defaultPickupLocation} is
              super easy and convenient. I love wearing my Senator shirt on
              Mondays."
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-green text-white font-serif flex items-center justify-center text-xs font-bold shrink-0">
                AO
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Amadi O.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  Senior Engineer, Eindhoven
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between h-full">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "My Royal Senator suit fits exactly as estimated. The process was
              very simple, and my colleagues love the design!"
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-gold text-heritage-green font-serif flex items-center justify-center text-xs font-bold shrink-0">
                FE
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Fredrick E.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  Veldhoven HQ Staff
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between h-full">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "I've received compliments every time I wear my traditional outfit. The craftsmanship is outstanding, the fit is perfect, and the delivery process was surprisingly smooth."
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-green text-white font-serif flex items-center justify-center text-xs font-bold shrink-0">
                MV
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Martijn V.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  ASML Mechanical Engineer
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between h-full">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "I loved being able to choose my own fabric and style. The entire experience felt personal, and the finished outfit exceeded my expectations."
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-gold text-heritage-green font-serif flex items-center justify-center text-xs font-bold shrink-0">
                SK
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Sarah K.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  Project Coordinator, Eindhoven
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open('src/components/HomeView.tsx', 'w') as f:
        f.write(content)
    print("Testimonials updated successfully.")
else:
    print("Error: Could not find the testimonials block.")
