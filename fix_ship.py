import re

with open('src/engine/BatchBusinessRules.ts', 'r') as f:
    content = f.read()

content = content.replace('  static canLeaveBatch(batch: any): boolean {', '  static canShipBatch(batch: any): boolean {\n    if (!batch || !batch.status) return false;\n    return ["QUALITY_CONTROL", "PACKED"].includes(batch.status);\n  }\n\n  static canLeaveBatch(batch: any): boolean {')

with open('src/engine/BatchBusinessRules.ts', 'w') as f:
    f.write(content)
