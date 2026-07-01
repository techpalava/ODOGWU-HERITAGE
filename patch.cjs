const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const target = `                {/* LIVE SUMMARY CARDS */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Customers</span>
                    <strong className="text-xl text-heritage-green font-mono">{customers.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Fabrics</span>
                    <strong className="text-xl text-heritage-green font-mono">{fabrics.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Available Fabrics</span>
                    <strong className="text-xl text-heritage-green font-mono">{fabrics.filter(f => (f.stock || 0) > 0).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Out of Stock Fabrics</span>
                    <strong className="text-xl text-red-600 font-mono">{fabrics.filter(f => (f.stock || 0) <= 0).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Orders</span>
                    <strong className="text-xl text-heritage-green font-mono">{orders.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Orders In Prod.</span>
                    <strong className="text-xl text-heritage-gold font-mono">{orders.filter(o => [3, 4].includes(o.shipment.currentStage)).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Completed Orders</span>
                    <strong className="text-xl text-heritage-green font-mono">{orders.filter(o => o.shipment.currentStage >= 5).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Cancelled Orders</span>
                    <strong className="text-xl text-gray-500 font-mono">{orders.filter(o => o.shipment.status.toLowerCase().includes("cancel")).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Community Photos</span>
                    <strong className="text-xl text-heritage-green font-mono">{communityPhotos.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Showpieces</span>
                    <strong className="text-xl text-heritage-green font-mono">{showpieces.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Revenue</span>
                    <strong className="text-xl text-heritage-green font-mono">€{orders.reduce((sum, o) => sum + (o.payment.isPaid || o.payment.secondPaymentStatus === "paid" ? o.payment.subtotal : (o.payment.deposit || 0)), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pending Payments</span>
                    <strong className="text-xl text-amber-600 font-mono">€{orders.reduce((sum, o) => sum + (o.payment.secondPaymentStatus !== "paid" ? o.payment.remaining : 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Completed Payments</span>
                    <strong className="text-xl text-heritage-green font-mono">€{orders.reduce((sum, o) => sum + (o.payment.isPaid || o.payment.secondPaymentStatus === "paid" ? o.payment.subtotal : (o.payment.deposit || 0)), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
                </div>`;

const replacement = `                {/* LIVE SUMMARY CARDS */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {/* Customers */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Customers</span>
                    <strong className="text-xl text-heritage-green font-mono">{customers.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Active Customers</span>
                    <strong className="text-xl text-heritage-green font-mono">{customers.filter(c => orders.some(o => o.customer.email === c.email)).length}</strong>
                  </div>
                  
                  {/* Fabrics */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Fabrics</span>
                    <strong className="text-xl text-heritage-green font-mono">{fabrics.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Available Fabrics</span>
                    <strong className="text-xl text-heritage-green font-mono">{fabrics.filter(f => (f.stock || 0) > 0 && f.stockStatus !== 'Out of Stock' && f.stockStatus !== 'Hidden').length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Out of Stock Fabrics</span>
                    <strong className="text-xl text-red-600 font-mono">{fabrics.filter(f => (f.stock || 0) <= 0 || f.stockStatus === 'Out of Stock').length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Hidden Fabrics</span>
                    <strong className="text-xl text-gray-500 font-mono">{fabrics.filter(f => f.stockStatus === 'Hidden').length}</strong>
                  </div>

                  {/* Orders */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Orders</span>
                    <strong className="text-xl text-heritage-green font-mono">{orders.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pending Orders</span>
                    <strong className="text-xl text-amber-600 font-mono">{orders.filter(o => [1, 2].includes(o.shipment.currentStage)).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Production Orders</span>
                    <strong className="text-xl text-heritage-gold font-mono">{orders.filter(o => [3, 4].includes(o.shipment.currentStage)).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Completed Orders</span>
                    <strong className="text-xl text-heritage-green font-mono">{orders.filter(o => o.shipment.currentStage >= 5).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Cancelled Orders</span>
                    <strong className="text-xl text-gray-500 font-mono">{orders.filter(o => o.shipment.status.toLowerCase().includes("cancel")).length}</strong>
                  </div>

                  {/* Payments */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pending Payments</span>
                    <strong className="text-xl text-amber-600 font-mono">€{orders.reduce((sum, o) => sum + (o.payment.secondPaymentStatus !== "paid" ? o.payment.remaining : 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Completed Payments</span>
                    <strong className="text-xl text-heritage-green font-mono">€{orders.reduce((sum, o) => sum + (o.payment.isPaid || o.payment.secondPaymentStatus === "paid" ? o.payment.subtotal : (o.payment.deposit || 0)), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Revenue</span>
                    <strong className="text-xl text-heritage-green font-mono">€{orders.reduce((sum, o) => sum + (o.payment.isPaid || o.payment.secondPaymentStatus === "paid" ? o.payment.subtotal : (o.payment.deposit || 0)), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Outstanding Balance</span>
                    <strong className="text-xl text-amber-600 font-mono">€{orders.reduce((sum, o) => sum + (o.payment.secondPaymentStatus !== "paid" ? o.payment.remaining : 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>

                  {/* Gallery */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Community Photos</span>
                    <strong className="text-xl text-heritage-green font-mono">{communityPhotos.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Showpieces</span>
                    <strong className="text-xl text-heritage-green font-mono">{showpieces.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Published Designs</span>
                    <strong className="text-xl text-heritage-green font-mono">{styles.length}</strong>
                  </div>

                  {/* Batch Production */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Active Batches</span>
                    <strong className="text-xl text-heritage-green font-mono">{batches.filter(b => b.status === "Sourcing" || b.status === "Production").length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Completed Batches</span>
                    <strong className="text-xl text-heritage-green font-mono">{batches.filter(b => b.status === "Completed").length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Upcoming Shipments</span>
                    <strong className="text-xl text-heritage-gold font-mono">{batches.filter(b => b.status === "Quality Control" || b.status === "Shipment").length}</strong>
                  </div>
                </div>`;

const statusTarget = `                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Firebase Connection</span>
                      <span className="text-green-400 font-bold">Healthy</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Firestore Status</span>
                      <span className="text-green-400 font-bold">Healthy</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Storage Status</span>
                      <span className="text-green-400 font-bold">Healthy</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Auth Status</span>
                      <span className="text-green-400 font-bold">Healthy</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Last Sync</span>
                      <span className="text-heritage-gold">Just now</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Docs Synced</span>
                      <span className="text-heritage-gold">{customers.length + fabrics.length + orders.length + communityPhotos.length + showpieces.length + batches.length}</span>
                    </div>
                  </div>`;

const statusReplacement = `                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Firestore</span>
                      <span className="text-green-400 font-bold">Connected</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Collection Count</span>
                      <span className="text-heritage-gold">{customers.length + fabrics.length + orders.length + communityPhotos.length + showpieces.length + batches.length} Docs</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Firebase Storage</span>
                      <span className="text-green-400 font-bold">Connected</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Images Stored</span>
                      <span className="text-heritage-gold">
                        {(() => {
                          let count = 0;
                          const checkUrl = (url) => { if (typeof url === 'string' && url.includes('firebasestorage')) count++; };
                          fabrics.forEach(f => checkUrl(f.image));
                          communityPhotos.forEach(p => checkUrl(p.url));
                          showpieces.forEach(s => s.images?.forEach(checkUrl));
                          return count;
                        })()} Images
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Authentication</span>
                      <span className="text-green-400 font-bold">Online</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Realtime Listeners</span>
                      <span className="text-green-400 font-bold">Active</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Last Event</span>
                      <span className="text-heritage-gold">Just now</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">System Status</span>
                      <span className="text-green-400 font-bold">Healthy</span>
                    </div>
                  </div>`;

if (content.includes(target) && content.includes(statusTarget)) {
  content = content.replace(target, replacement);
  content = content.replace(statusTarget, statusReplacement);
  fs.writeFileSync('src/components/DatabaseView.tsx', content);
  console.log('Successfully replaced live dashboard metrics.');
} else {
  console.log('Target not found.');
}
