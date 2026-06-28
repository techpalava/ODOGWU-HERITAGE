import React from 'react';
import { ShoppingBag, X, Trash2, CreditCard } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export function CartDrawer() {
  const isCartOpen = useAppStore(state => state.isCartOpen);
  const setIsCartOpen = useAppStore(state => state.setIsCartOpen);
  const cartItems = useAppStore(state => state.cartItems);
  const setCartItems = useAppStore(state => state.setCartItems);
  const setIsCheckoutPaymentOpen = useAppStore(state => state.setIsCheckoutPaymentOpen);
  const setActiveTab = useAppStore(state => state.setActiveTab);
  const setNotification = useAppStore(state => state.setNotification);
  const businessSettings = useAppStore(state => state.businessSettings);

  if (!isCartOpen) return null;

  const handleRemoveFromCart = (id: string) => {
    setCartItems(cartItems.filter(item => item.id !== id));
    setNotification({ message: 'Garment removed from cart.', type: 'info' });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) return;
    setIsCheckoutPaymentOpen(true);
  };

  const subtotal = cartItems.reduce((acc, item) => acc + item.garment.totalPrice + (item.design.additionalCap ? 15 : 0), 0);
  const depositRatio = businessSettings.pricingSettings.depositPercentage / 100;
  const depositAmount = subtotal * depositRatio;
  const currencySymbol = businessSettings.pricingSettings.currency === 'EUR' ? '€' : businessSettings.pricingSettings.currency === 'USD' ? '$' : '₦';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Backdrop */}
      <div 
        onClick={() => setIsCartOpen(false)}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex">
        <div className="w-screen max-w-md bg-heritage-cream border-l-2 border-heritage-gold/25 flex flex-col justify-between shadow-2xl animate-fade-in">
          
          {/* Drawer Header */}
          <div className="bg-heritage-green border-b border-heritage-gold/25 p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-heritage-forest border border-heritage-gold/20 rounded-xl text-heritage-gold">
                <ShoppingBag size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-serif">Shopping Cart</h2>
                <p className="text-[10px] text-heritage-beige/70 mt-0.5">{cartItems.length} custom items in your cart</p>
              </div>
            </div>
            <button 
              onClick={() => setIsCartOpen(false)}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] rounded-lg text-heritage-beige/60 hover:text-heritage-gold hover:bg-heritage-forest transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {cartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 select-none">
                <div className="h-16 w-16 rounded-full bg-heritage-gold/10 border border-heritage-gold/20 flex items-center justify-center text-heritage-gold animate-bounce">
                  <ShoppingBag size={28} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-heritage-green uppercase tracking-wider">Your Cart is Empty</h3>
                  <p className="text-[11px] text-heritage-ink/70 leading-relaxed max-w-xs">
                    Craft custom Senator attire, Agbadas, or Boubous calibrated to your specific AI-supported dimensions.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsCartOpen(false);
                    setActiveTab('design');
                  }}
                  className="px-5 py-2 rounded-xl bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                >
                  Open Design Studio
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {cartItems.map((item) => {
                  const itemTotal = item.garment.totalPrice + (item.design.additionalCap ? 15 : 0);
                  return (
                    <div 
                      key={item.id} 
                      className="bg-white border border-gray-150 rounded-2xl p-4 space-y-3 relative overflow-hidden shadow-sm hover:border-heritage-gold/30 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="px-2 py-0.5 bg-heritage-gold/10 text-heritage-green border border-heritage-gold/20 rounded text-[8px] uppercase tracking-wider font-extrabold">
                            {item.style.gender}
                          </span>
                          <h4 className="font-serif font-bold text-heritage-green text-xs mt-1.5 leading-tight">
                            {item.style.name}
                          </h4>
                          <p className="text-[10px] text-heritage-ink/60 font-semibold mt-0.5">
                            {item.garment.type} ({item.measurements.unit || 'inch'})
                          </p>
                        </div>
                        <span className="text-xs font-bold text-heritage-green font-mono">
                          {currencySymbol}{itemTotal.toFixed(2)}
                        </span>
                      </div>

                      <div className="bg-heritage-cream/30 p-2.5 rounded-xl text-[10px] space-y-1 text-heritage-ink/75 font-sans">
                        <p>
                          🎨 Fabric: <strong>{item.fabric.name} ({item.fabric.code})</strong>
                        </p>
                        <p>
                          🪡 Accent: <strong>{item.design.collar}</strong>
                        </p>
                        <p>
                          👤 Recipient: <strong>{item.customer.name}</strong>
                        </p>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <span className="text-[9px] text-heritage-ink/40 font-semibold font-mono">
                          ID: {item.id.split('-').slice(0, 2).join('-')}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.id)}
                          className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 sm:py-1 min-h-[44px] sm:min-h-[32px] rounded-lg transition flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={10} /> Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Drawer Footer summary */}
          {cartItems.length > 0 && (
            <div className="bg-white border-t border-heritage-gold/25 p-6 space-y-4">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-heritage-ink/70">
                  <span>Subtotal ({cartItems.length} garment{cartItems.length > 1 ? 's' : ''}):</span>
                  <span className="font-mono font-semibold text-heritage-green">
                    {currencySymbol}{subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-heritage-ink/70">
                  <span>Secure Escrow Deposit ({businessSettings.pricingSettings.depositPercentage}%):</span>
                  <span className="font-mono font-semibold text-heritage-gold">
                    {currencySymbol}{depositAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-sm text-heritage-green border-t pt-2 font-serif">
                  <span>Total checkout deposit:</span>
                  <span className="font-mono">
                    {currencySymbol}{depositAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-heritage-cream/50 border border-heritage-gold/15 rounded-xl text-[9px] leading-relaxed text-heritage-ink/75 flex items-start gap-2">
                <span className="text-heritage-gold text-xs leading-none">🛡️</span>
                <div>
                  <strong>Heritage Escrow System:</strong> Your {businessSettings.pricingSettings.depositPercentage}% deposit activates our Lagos weaving looms immediately. The final {100 - businessSettings.pricingSettings.depositPercentage}% remains in escrow until your physical locker delivery is complete.
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                className="w-full bg-heritage-gold text-heritage-forest hover:bg-heritage-green hover:text-white transition py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <CreditCard size={12} /> Place Group Order Securely
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
