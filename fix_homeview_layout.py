import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

old_block = """                  className="absolute inset-0 w-full h-full"
                >
                  {/* Ken Burns zooming effect on image */}
                  <motion.img
                    src={selectedPhotos[activePhotoIndex].url}
                    alt={
                      selectedPhotos[activePhotoIndex].caption ||
                      "Community wear"
                    }
                    initial={{ scale: 1 }}
                    animate={{ scale: 1.06 }}
                    transition={{ duration: 5, ease: "easeOut" }}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                  {/* Rich Gradient Vignette Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-heritage-green/95 via-heritage-green/40 to-transparent" />
                  {/* Elegant Top Cohort Badge */}
                  <div className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-2">
                    <span className="bg-heritage-gold/90 text-heritage-forest text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg border border-white/20">
                      {selectedPhotos[activePhotoIndex].cohortName ||
                        "Odogwu Heritage"}
                    </span>
                    <span className="bg-black/45 backdrop-blur-xs text-white text-[10px] font-semibold px-2.5 py-1 rounded-full border border-white/10">
                      Delivered {selectedPhotos[activePhotoIndex].deliveryYear}
                    </span>
                  </div>
                  {/* Caption Overlay */}
                  <div className="absolute bottom-0 inset-x-0 p-5 sm:p-8 space-y-2 text-left">
                    <p className="text-white text-xs sm:text-sm font-semibold max-w-2xl leading-relaxed drop-shadow-sm font-sans">
                      "
                      {selectedPhotos[activePhotoIndex].caption ||
                        "Bespoke tailoring, designed with reverence."}
                      "
                    </p>
                  </div>
                </motion.div>"""

new_block = """                  className="absolute inset-0 w-full h-full flex flex-col"
                >
                  {/* Image Area */}
                  <div className="relative w-full h-[75%] sm:h-[78%] lg:h-[80%] overflow-hidden bg-heritage-cream/5">
                    {/* Ken Burns zooming effect on image */}
                    <motion.img
                      src={selectedPhotos[activePhotoIndex].url}
                      alt={
                        selectedPhotos[activePhotoIndex].caption ||
                        "Community wear"
                      }
                      initial={{ scale: 1 }}
                      animate={{ scale: 1.06 }}
                      transition={{ duration: 5, ease: "easeOut" }}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                    {/* Elegant Top Cohort Badge */}
                    <div className="absolute top-4 left-4 sm:top-6 sm:left-6 flex flex-wrap items-center gap-2">
                      <span className="bg-heritage-gold/90 text-heritage-forest text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg border border-white/20">
                        {selectedPhotos[activePhotoIndex].cohortName ||
                          "Odogwu Heritage"}
                      </span>
                      <span className="bg-black/45 backdrop-blur-xs text-white text-[10px] font-semibold px-2.5 py-1 rounded-full border border-white/10">
                        Delivered {selectedPhotos[activePhotoIndex].deliveryYear}
                      </span>
                    </div>
                  </div>
                  {/* Caption Area */}
                  <div className="w-full h-[25%] sm:h-[22%] lg:h-[20%] p-4 sm:p-6 flex items-center bg-heritage-green border-t border-heritage-gold/10">
                    <p className="text-white text-xs sm:text-sm font-semibold w-full leading-relaxed drop-shadow-sm font-sans line-clamp-2 sm:line-clamp-3">
                      "
                      {selectedPhotos[activePhotoIndex].caption ||
                        "Bespoke tailoring, designed with reverence."}
                      "
                    </p>
                  </div>
                </motion.div>"""

content = content.replace(old_block, new_block)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)
