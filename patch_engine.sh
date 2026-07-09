#!/bin/bash
sed -i '/export class OrderRoutingEngine {/a \
  static categorizeWorkspace(\n    cartItems: any[],\n    activeOrders: any[],\n    historicalOrders: any[]\n  ) {\n    return {\n      drafts: cartItems || [],\n      communityOrders: (activeOrders || []).filter(o => o.batchType === "community"),\n      individualOrders: (activeOrders || []).filter(o => o.batchType === "alone"),\n      personalizedBatches: (activeOrders || []).filter(o => o.batchType === "personalized"),\n      completedOrders: historicalOrders || []\n    };\n  }' src/engine/OrderRoutingEngine.ts
