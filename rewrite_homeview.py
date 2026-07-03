import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

# Replace the Group Status Card section with a much simpler one using Presentation model
card_start_idx = content.find("          {/* Group Status Card */}")
card_end_idx = content.find("      {/* Why Choose NTCC? */}")

if card_start_idx != -1 and card_end_idx != -1:
    new_card = """          {/* Group Status Card */}
          <div className="lg:col-span-5 font-sans">
            <div className="rounded-2xl border border-heritage-gold/30 bg-heritage-forest p-6 space-y-5 shadow-xl">
              {(() => {
                const presentation = BatchBusinessRules.getHeroPresentation(activeCommunityBatch);
                const progress = BatchBusinessRules.getProgressState(activeCommunityBatch);
                
                return (
                  <>
                    <div className="flex justify-between items-center text-left">
                      <div>
                        <span className="text-[10px] text-heritage-gold font-bold tracking-widest uppercase block">
                          {presentation.title}
                        </span>
                        <h3 className="text-lg font-serif font-bold text-white mt-0.5">
                          {presentation.headline}
                        </h3>
                      </div>
                      {presentation.badgeStyle === "pulsing-gold" ? (
                        <motion.span
                          animate={{
                            opacity: [0.8, 1, 0.8],
                            boxShadow: [
                              "0 0 0px rgba(212,175,55,0)",
                              "0 0 8px rgba(212,175,55,0.4)",
                              "0 0 0px rgba(212,175,55,0)",
                            ],
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 2.5,
                            ease: "easeInOut",
                          }}
                          className="bg-heritage-gold/20 text-heritage-gold border border-heritage-gold/40 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider inline-block"
                        >
                          {presentation.badgeText}
                        </motion.span>
                      ) : presentation.badgeStyle === "gold-static" ? (
                        <span className="bg-heritage-gold/20 text-heritage-gold border border-heritage-gold/40 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider">
                          {presentation.badgeText}
                        </span>
                      ) : presentation.badgeStyle === "green" ? (
                        <span className="bg-heritage-green/20 text-heritage-beige border border-heritage-green/40 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider">
                          {presentation.badgeText}
                        </span>
                      ) : (
                        <span className="bg-red-600/20 text-red-300 border border-red-600/40 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider">
                          {presentation.badgeText}
                        </span>
                      )}
                    </div>

                    {presentation.showProgress && activeCommunityBatch && (
                      <div className="space-y-2 text-left">
                        <div className="flex justify-between text-[10px] text-heritage-beige font-mono mb-1">
                          <span>
                            {activeCommunityBatch.currentMembers} / {activeCommunityBatch.expectedParticipants} Garments
                          </span>
                          <span>
                            {progress.completionPercentage}% Complete
                          </span>
                        </div>
                        <div className="h-2 w-full bg-heritage-green rounded-full overflow-hidden">
                          <div
                            className="h-full bg-heritage-gold transition-all duration-500"
                            style={{
                              width: `${progress.completionPercentage}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {!presentation.showCountdown && presentation.productionPhase && (
                      <div className="pt-3 border-t border-white/15 space-y-2 text-left">
                        <span className="text-[10px] text-heritage-gold uppercase tracking-wider font-bold block">
                          Current Phase:
                        </span>
                        <div className="bg-white/5 border border-white/10 p-4 rounded-xl text-center space-y-1">
                          <strong className="text-xs text-heritage-gold font-serif block uppercase tracking-wide">
                            {presentation.productionPhase}
                          </strong>
                          <span className="text-[10px] text-white/70 block leading-normal">
                            {presentation.productionDescription}
                          </span>
                        </div>
                      </div>
                    )}

                    {presentation.showCountdown && (
                      <div className="pt-3 border-t border-white/15 space-y-2 text-left">
                        <span className="text-[10px] text-heritage-gold uppercase tracking-wider font-bold block">
                          Registration Closes In:
                        </span>
                        <div className="grid grid-cols-3 gap-2 text-center text-white font-serif">
                          <div className="bg-white/5 border border-white/10 p-2 rounded-xl">
                            <strong className="text-lg text-heritage-gold block">
                              {progress.daysRemaining}
                            </strong>
                            <span className="text-[8px] uppercase tracking-wider text-white/50 font-sans">
                              Days
                            </span>
                          </div>
                          <div className="bg-white/5 border border-white/10 p-2 rounded-xl">
                            <strong className="text-lg text-heritage-gold block">
                              {progress.hoursRemaining.toString().padStart(2, "0")}
                            </strong>
                            <span className="text-[8px] uppercase tracking-wider text-white/50 font-sans">
                              Hours
                            </span>
                          </div>
                          <div className="bg-white/5 border border-white/10 p-2 rounded-xl">
                            <strong className="text-lg text-heritage-gold block">
                              {progress.minutesRemaining.toString().padStart(2, "0")}
                            </strong>
                            <span className="text-[8px] uppercase tracking-wider text-white/50 font-sans">
                              Mins
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeCommunityBatch && (
                      <div className="grid grid-cols-2 gap-4 text-xs pt-4 border-t border-white/10">
                        <div className="text-left">
                          <span className="text-white/50 block text-[9px]">
                            Sourcing Closes:
                          </span>
                          <span className="font-bold text-white">
                            {activeCommunityBatch.closingDate.replace(", 2026", "")}
                          </span>
                        </div>
                        <div className="text-right sm:text-left">
                          <span className="text-white/50 block text-[9px]">
                            Veldhoven Handoff:
                          </span>
                          <span className="font-bold text-white font-serif text-heritage-gold">
                            {activeCommunityBatch.deliveryWindow.replace(", 2026", "")}
                          </span>
                        </div>
                      </div>
                    )}

                    {!activeCommunityBatch && (
                      <div className="text-center py-2 space-y-3">
                         <div className="w-12 h-12 bg-heritage-gold/10 border border-heritage-gold/30 rounded-full flex items-center justify-center mx-auto text-heritage-gold mb-4">
                           <span className="text-lg">⚜</span>
                         </div>
                         <button
                           onClick={() => onNavigateToTab("custom-order")}
                           className="w-full bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg inline-flex items-center justify-center gap-2 cursor-pointer"
                         >
                           {presentation.buttonText} <ArrowRight size={14} />
                         </button>
                         <button
                           onClick={() => {
                             onNavigateToTab("custom-order");
                             setTimeout(() => {
                               const el = document.getElementById("option-join-group");
                               if (el) el.scrollIntoView({ behavior: "smooth" });
                             }, 100);
                           }}
                           className="w-full border border-heritage-gold/50 text-heritage-gold hover:bg-heritage-gold/10 transition duration-300 py-3 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer mt-2"
                         >
                           Join A Personalized Group <ArrowRight size={14} />
                         </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

"""
    new_content = content[:card_start_idx] + new_card + content[card_end_idx:]
    with open('src/components/HomeView.tsx', 'w') as f:
        f.write(new_content)
