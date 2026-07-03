lines = []
with open('src/components/HomeView.tsx', 'r') as f:
    lines = f.readlines()

# Fix 424
if lines[423].strip() == ')}':
    lines[423] = '                    </div>\n'
if lines[424].strip() == '</div>':
    lines[424] = '                  )}\n'
if lines[425].strip() == ')}':
    lines.pop(425)

# Fix 611
#    611	                    )}
#    612	                  </div>
#    613	        {activeFabrics.length === 0 ? (
if lines[610].strip() == ')}':
    lines.pop(610)

# Fix 836
#    836	                    )}
#    837	        )}
if lines[835].strip() == ')}':
    lines.pop(835)

with open('src/components/HomeView.tsx', 'w') as f:
    f.writelines(lines)
