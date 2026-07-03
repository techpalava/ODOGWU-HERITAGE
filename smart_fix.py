import re

with open('src/components/HomeView.tsx', 'r') as f:
    text = f.read()

# Fix 1: % Complete
text = re.sub(
    r'(\s*100,)\n\s*\n\s*% Complete\n\s*</span>\n\s*\)}',
    r'\1\n                        )}% Complete\n                      </span>',
    text
)

# Fix 2: deliveryWindow.replace
text = re.sub(
    r'("",)\n\s*\n\s*</span>\n\s*\)}',
    r'\1\n                        )}\n                      </span>',
    text
)

# Fix 3: showpiece.tag
text = re.sub(
    r'(</span>)\n\s*\n\s*</div>\n\s*\)}',
    r'\1\n                    )}\n                  </div>',
    text
)

# Fix 4: activeFabrics.length
text = re.sub(
    r'\n\s*\{activeFabrics\.length === 0 \? \(\n\s*\)}',
    r'\n        )}\n        {activeFabrics.length === 0 ? (',
    text
)

# Fix 5: fabric.stockStatus
text = re.sub(
    r'\n\s*\{fabric\.stockStatus === "LOW_STOCK" && \(\n\s*\)}',
    r'\n                    )}\n                    {fabric.stockStatus === "LOW_STOCK" && (',
    text
)

# Fix 6: after stock status (Line 666)
text = re.sub(
    r'\n\s*</div>\n\s*\)}',
    r'\n                    )}\n                  </div>',
    text
)

# Fix 7: Community Photo Gallery Showcase (Line 710)
text = re.sub(
    r'\n\s*</section>\n\s*\)}\n\s*\{/\* Community Photo Gallery Showcase \*/\}',
    r'\n        )}\n      </section>\n\n      {/* Community Photo Gallery Showcase */}',
    text
)

# Fix 8: Custom Dot Progress Indicator (Line 807)
text = re.sub(
    r'\n\s*</div>\n\s*\)}\n\s*\{/\* Custom Dot Progress Indicator & Carousel Controllers \*/\}',
    r'\n              )}\n            </div>\n\n            {/* Custom Dot Progress Indicator & Carousel Controllers */}',
    text
)

# Fix 9: Premium Empty/Fallback State Placeholder (Line 829)
text = re.sub(
    r'\n\s*\) : \(\n\s*\)}\n\s*/\* Premium Empty/Fallback State Placeholder \*/',
    r'\n        ) : (\n          /* Premium Empty/Fallback State Placeholder */',
    text
)

# Fix 10: End of Community Photo Gallery Showcase section (Line 848)
text = re.sub(
    r'\n\s*\)}\n\s*</section>\n\n\s*\{/\* Multicultural Fun Stats Banner \*/\}',
    r'\n        )}\n      </section>\n\n      {/* Multicultural Fun Stats Banner */}',
    text
)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(text)

