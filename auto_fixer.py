import re

with open('src/components/HomeView.tsx', 'r') as f:
    lines = f.readlines()

def print_context(line_num):
    start = max(0, line_num - 3)
    end = min(len(lines), line_num + 3)
    print(f"--- Line {line_num} Context ---")
    for i in range(start, end):
        print(f"{i+1}: {lines[i].rstrip()}")
    print()

errors = [220, 221, 222, 312, 313, 453, 454, 619, 620, 659, 660, 666, 710, 807, 808, 827, 829, 848]
for e in errors:
    print_context(e)
