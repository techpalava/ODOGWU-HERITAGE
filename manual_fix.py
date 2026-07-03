lines = []
with open('src/components/HomeView.tsx', 'r') as f:
    lines = f.readlines()

# 1. Line 342, 344
# Delete line 342 (index 341) `                    )}\n`
# And replace line 344 (index 343) `            </div>\n` with `              )}\n            </div>\n`
if lines[341].strip() == ')}':
    lines.pop(341)
lines[342] = '              )}\n            </div>\n'

# 2. Line 424, 427
# Delete line 424 (index 423) `                    )}\n`
# Replace line 425 `                  </div>\n` with `                  </div>\n                )}\n`
if lines[423].strip() == ')}':
    lines.pop(423)
lines[423] = '                  </div>\n                )}\n'

# 3. Line 611, 613
# Delete line 611 (index 610) `                    )}\n`
# Replace line 612 `                  </div>\n` with `          </div>\n        )}\n`
if lines[610].strip() == ')}':
    lines.pop(610)
lines[610] = '          </div>\n        )}\n'

# 4. Line 834, 837
# Delete 834 and 835 `                    )}\n` and `                  </div>\n`
# And add `        )}\n` at 834
if lines[833].strip() == ')}':
    lines.pop(833)
if lines[833].strip() == '</div>':
    lines.pop(833)
lines.insert(833, '        )}\n')


with open('src/components/HomeView.tsx', 'w') as f:
    f.writelines(lines)
