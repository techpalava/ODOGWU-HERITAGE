import re

with open('src/components/GalleryView.tsx', 'r') as f:
    content = f.read()

old_block = """                          <div
                            key={photo.id}
                            className="group bg-white rounded-3xl border border-heritage-gold/15 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col"
                          >
                            <div className="relative h-96 w-full overflow-hidden bg-heritage-cream">
                              <img
                                src={photo.url}
                                alt={photo.caption || "Community Photo"}
                                className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                                referrerPolicy="no-referrer"
                              />
                              {photo.featured && (
                                <div className="absolute top-4 right-4 bg-heritage-gold text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow-sm">
                                  Featured
                                </div>
                              )}
                            </div>
                            <div className="p-5 space-y-2 flex-grow flex flex-col justify-between font-sans text-xs">
                              <p className="text-heritage-ink/80 leading-relaxed italic">
                                "{photo.caption}"
                              </p>
                              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                                <span className="font-mono text-[10px] text-heritage-ink/60">
                                  {photo.deliveryYear}
                                </span>
                              </div>
                            </div>
                          </div>"""

new_block = """                          <div
                            key={photo.id}
                            className="group bg-white rounded-3xl border border-heritage-gold/15 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col aspect-[3/4] sm:aspect-[4/5] lg:aspect-[3/4]"
                          >
                            <div className="relative h-[75%] sm:h-[78%] lg:h-[80%] w-full overflow-hidden bg-heritage-cream">
                              <img
                                src={photo.url}
                                alt={photo.caption || "Community Photo"}
                                className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                                referrerPolicy="no-referrer"
                              />
                              {photo.featured && (
                                <div className="absolute top-4 right-4 bg-heritage-gold text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow-sm">
                                  Featured
                                </div>
                              )}
                            </div>
                            <div className="h-[25%] sm:h-[22%] lg:h-[20%] p-4 sm:p-5 space-y-2 flex flex-col justify-between font-sans text-xs">
                              <p className="text-heritage-ink/80 leading-relaxed italic line-clamp-2 sm:line-clamp-3">
                                "{photo.caption}"
                              </p>
                              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                                <span className="font-mono text-[10px] text-heritage-ink/60">
                                  {photo.deliveryYear}
                                </span>
                              </div>
                            </div>
                          </div>"""

content = content.replace(old_block, new_block)

with open('src/components/GalleryView.tsx', 'w') as f:
    f.write(content)
