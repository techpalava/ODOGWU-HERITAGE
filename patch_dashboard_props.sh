#!/bin/bash
sed -i '/historicalOrders: HistoricalOrder\[\];/a \  activeOrders: MasterOrder[];\n  drafts: any[];\n  onDeleteDraft: (id: string) => void;' src/components/DashboardView.tsx
sed -i '/historicalOrders,/a \  activeOrders,\n  drafts,\n  onDeleteDraft,' src/components/DashboardView.tsx
