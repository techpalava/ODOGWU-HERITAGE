lines = []
with open('src/components/HomeView.tsx', 'r') as f:
    lines = f.readlines()

def insert_line(idx, text):
    lines.insert(idx, text + "\n")

insert_line(834, '        )}')
insert_line(639, '                  )}')
insert_line(424, '                  )}')
insert_line(343, '              )}')
insert_line(140, '              )}')

with open('src/components/HomeView.tsx', 'w') as f:
    f.writelines(lines)
