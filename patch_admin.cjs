const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const injection = `
                    <div className="pt-4 border-t border-gray-200 mt-4">
                      <h4 className="font-bold text-heritage-green text-sm mb-2">Supported Garment Details</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {['trousers', 'shorts', 'skirt', 'dress', 'sleeves', 'pockets', 'embroidery', 'accessories', 'lining'].map((field) => (
                          <label key={field} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={editingItem.supportedGarmentDetails?.[field] ?? true}
                              onChange={(e) => {
                                setEditingItem({
                                  ...editingItem,
                                  supportedGarmentDetails: {
                                    ...(editingItem.supportedGarmentDetails || {}),
                                    [field]: e.target.checked
                                  }
                                });
                              }}
                              className="rounded border-gray-300 text-heritage-gold focus:ring-heritage-gold"
                            />
                            {field.charAt(0).toUpperCase() + field.slice(1)}
                          </label>
                        ))}
                      </div>
                    </div>
`;

content = content.replace('                    {/* Options list management */}', injection + '\n                    {/* Options list management */}');
fs.writeFileSync('src/components/DatabaseView.tsx', content);
