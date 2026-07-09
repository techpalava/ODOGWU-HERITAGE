#!/bin/bash
sed -i '/const handleRoutingActionSelect = (actionType: string) => {/a \
    if (!OrderRoutingEngine.canChangeRouting(orderContext)) {\n      alert("This order has already been confirmed and can no longer be changed.");\n      setShowRoutingPanel(false);\n      return;\n    }' src/components/DesignStudioView.tsx
