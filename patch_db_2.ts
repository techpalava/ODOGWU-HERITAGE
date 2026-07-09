import fs from 'fs';

let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

content = content.replace(
  /active\.currentGarments \* 6\.5/g,
  'CapacityService.getReservedCapacity(active) * 6.5'
);

// We can probably leave editingItem.currentGarments as is, since it's the raw admin form.
// But we should replace value={editingItem.currentGarments} with value={CapacityService.getReservedCapacity(editingItem)} ? No, because they might be editing the raw object.
// Actually, editingItem.currentGarments is read-only or read/write? If read/write, we can't just use the service getter unless we also change the onChange.
// "Do NOT implement the Capacity Ledger yet."
// Let's leave editingItem.currentGarments alone.

fs.writeFileSync('src/components/DatabaseView.tsx', content);
