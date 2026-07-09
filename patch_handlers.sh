#!/bin/bash
sed -i 's/batchType === "community"/batchType === "community"/g' src/components/DesignStudioView.tsx

# Patch proceedToCart
sed -i 's/batchType === "community"/batchType === "community"/g' src/components/DesignStudioView.tsx
