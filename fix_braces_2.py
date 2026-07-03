lines = []
with open('src/components/HomeView.tsx', 'r') as f:
    lines = f.readlines()

def insert_line(idx, text):
    lines.insert(idx, text + "\n")

# Reverse order so indices don't shift
insert_line(820, '        )}') # line 819
insert_line(800, '              )}')
insert_line(703, '        )}')
insert_line(660, '                    )}')
insert_line(655, '                    )}')
insert_line(616, '        )}')
insert_line(451, '                    )}')
insert_line(311, '                        )}')
insert_line(221, '                        )}')

with open('src/components/HomeView.tsx', 'w') as f:
    f.writelines(lines)
