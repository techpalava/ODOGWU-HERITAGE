#!/bin/bash
sed -i 's/historicalOrders={historicalOrders}/historicalOrders={historicalOrders}\n                  activeOrders={orders}\n                  drafts={cartItems}\n                  onDeleteDraft={(id) => setCartItems((prev) => prev.filter((i) => i.id !== id))}/g' src/App.tsx
