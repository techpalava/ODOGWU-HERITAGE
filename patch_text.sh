#!/bin/bash
sed -i 's/<p>You can change your ordering option at any time before payment.<\/p>/{OrderRoutingEngine.canChangeRouting(orderContext) ? (<p>You can change your ordering option at any time before payment.<\/p>) : (<p className="text-red-500">This order has already been confirmed and can no longer be changed.<\/p>)}/g' src/components/DesignStudioView.tsx
