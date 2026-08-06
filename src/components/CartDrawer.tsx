import { useState } from "react";
import { ShoppingBag, X, Trash2, CreditCard } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import {
  BATCH_MINIMUM_GARMENTS,
  calculateCartPricing,
  confirmCartShippingReprice,
  FINAL_MILE_COUNTRY_OPTIONS,
  getStoredShippingCost,
} from "../utils/shippingPricing";
import {
  confirmCartPricingUpdates,
  rerouteCartItemToIndividual,
  revalidateCartForCheckout,
} from "../utils/checkoutValidation";
import type {
  CartItem,
  DeliveryAddress,
  DeliveryMethod,
} from "../types";
import {
  clampDepositPercentage,
  getDepositRatio,
  PRICING_CURRENCY_SYMBOL,
} from "../utils/money";
import { isBatchPricingRoute } from "../utils/designPricing";
import { FabricCapacityEngine } from "../engine/FabricCapacityEngine";
import {
  getCustomDetailSnapshots,
  hasSelectedCustomDetailOption,
} from "../utils/catalogHelpers";
import { DRESS_LINING_OPTION_ID } from "../config/GarmentDetailsConfig";
import {
  getMonogramPlacementLabel,
  filterDesignSelectionsForDecorativeFeatures,
} from "../utils/decorativePricing";

export function CartDrawer() {
  const [shippingEditorItemId, setShippingEditorItemId] = useState<
    string | null
  >(null);
  const [shippingEditorMethod, setShippingEditorMethod] =
    useState<DeliveryMethod>("PICKUP");
  const [shippingEditorAddress, setShippingEditorAddress] =
    useState<DeliveryAddress>({
      addressLine1: "",
      city: "",
      postalCode: "",
      countryCode: "NL",
    });
  const [shippingEditorRoute, setShippingEditorRoute] =
    useState<NonNullable<CartItem["batchType"]>>("alone");
  const [shippingEditorQuantity, setShippingEditorQuantity] =
    useState("1");
  const [shippingEditorBatchId, setShippingEditorBatchId] = useState("");
  const [shippingEditorBatchName, setShippingEditorBatchName] = useState("");
  const [rerouteItemIds, setRerouteItemIds] = useState<string[]>([]);
  const isCartOpen = useAppStore((state) => state.isCartOpen);
  const setIsCartOpen = useAppStore((state) => state.setIsCartOpen);
  const cartItems = useAppStore((state) => state.cartItems);
  const setCartItems = useAppStore((state) => state.setCartItems);
  const setIsCheckoutPaymentOpen = useAppStore(
    (state) => state.setIsCheckoutPaymentOpen,
  );
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setNotification = useAppStore((state) => state.setNotification);
  const setCheckoutIntent = useAppStore(
    (state) => state.setCheckoutIntent,
  );
  const businessSettings = useAppStore((state) => state.businessSettings);
  const currentUser = useAppStore((state) => state.currentUser);
  const batches = useAppStore((state) => state.batches);
  const fabrics = useAppStore((state) => state.fabrics);
  const styles = useAppStore((state) => state.styles);
  const customDetailCatalog = useAppStore((state) => state.customDetailCatalog);

  if (!isCartOpen) return null;

  const handleRemoveFromCart = (id: string) => {
    setCartItems(cartItems.filter((item) => item.id !== id));
    setNotification({ message: "Garment removed from cart.", type: "info" });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const openShippingEditor = (item: CartItem) => {
    const method = item.deliverySelection?.method || "PICKUP";
    setShippingEditorMethod(method);
    setShippingEditorAddress(
      item.deliverySelection?.address || {
        addressLine1: "",
        city: "",
        postalCode: "",
        countryCode: "NL",
      },
    );
    setShippingEditorRoute(item.batchType || "alone");
    setShippingEditorQuantity(
      String(
        item.garmentPieceCount ??
          item.shippingSnapshot?.garmentPieceCount ??
          "",
      ),
    );
    setShippingEditorBatchId(
      item.batchId || item.customGroupCode || "",
    );
    setShippingEditorBatchName(item.batchName || "");
    setShippingEditorItemId(item.id);
  };

  const saveShippingDetails = (item: CartItem) => {
    const garmentPieceCount = Number.parseInt(
      shippingEditorQuantity,
      10,
    );
    const deliverySelection =
      shippingEditorMethod === "PICKUP"
        ? {
            method: "PICKUP" as const,
            pickupLocation:
              businessSettings.productionSettings.defaultPickupLocation,
            pickupWindow:
              item.deliverySelection?.pickupWindow || "To be arranged",
          }
        : {
            method: "DELIVERY" as const,
            address: shippingEditorAddress,
            actualParcelWeightKg:
              item.deliverySelection?.actualParcelWeightKg,
          };

    setCartItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              batchType: shippingEditorRoute,
              batchId:
                shippingEditorRoute === "alone"
                  ? undefined
                  : shippingEditorBatchId,
              batchName:
                shippingEditorRoute === "alone"
                  ? "Individual Order (No Batch)"
                  : shippingEditorBatchName,
              customGroupCode:
                shippingEditorRoute === "personalized"
                  ? shippingEditorBatchId
                  : currentItem.customGroupCode,
              garmentPieceCount:
                Number.isInteger(garmentPieceCount) &&
                garmentPieceCount > 0
                  ? garmentPieceCount
                  : undefined,
              deliverySelection,
            }
          : currentItem,
      ),
    );
    setShippingEditorItemId(null);
    setNotification({
      message: "Shipping details updated. Please review the current amount.",
      type: "success",
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const acceptUpdatedShipping = () => {
    setCartItems((currentItems) =>
      confirmCartShippingReprice(currentItems),
    );
    setNotification({
      message: "Updated shipping amount accepted.",
      type: "success",
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const acceptUpdatedGarmentPricing = () => {
    setCartItems((currentItems) =>
      confirmCartPricingUpdates(currentItems),
    );
    setNotification({
      message: "Updated garment price accepted.",
      type: "success",
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const continueAsIndividualOrder = (itemId: string) => {
    setCartItems((currentItems) =>
      rerouteCartItemToIndividual(currentItems, itemId),
    );
    setRerouteItemIds((current) =>
      current.filter((candidate) => candidate !== itemId),
    );
    setNotification({
      message:
        "The design was preserved and moved to an individual order route.",
      type: "success",
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) return;
    const validation = revalidateCartForCheckout(cartItems, {
      fabrics,
      styles,
      batches,
      customDetailCatalog,
      businessSettings,
      depositRatio,
    });
    if (validation.changed) {
      setCartItems(validation.items);
    }
    setRerouteItemIds(validation.rerouteItemIds);
    if (!validation.canProceed) {
      setNotification({
        message:
          validation.blockers[0] ||
          "Review the cart before payment.",
        type: "info",
      });
      setTimeout(() => {
        setNotification(null);
      }, 5000);
      return;
    }

    if (!currentUser) {
      setCheckoutIntent(true);
      setIsCartOpen(false);
      setActiveTab("login");
      setNotification({
        message:
          "Sign in or create an account to securely complete your order.",
        type: "info",
      });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setIsCheckoutPaymentOpen(true);
  };

  const depositPercentage = clampDepositPercentage(
    businessSettings.pricingSettings.depositPercentage,
  );
  const depositRatio = getDepositRatio(depositPercentage);
  const cartPricing = calculateCartPricing(cartItems, depositRatio);
  const subtotal = cartPricing.total;
  const depositAmount = cartPricing.depositDueNow;
  const currencySymbol = PRICING_CURRENCY_SYMBOL;
  const repricedItems = cartItems.filter(
    (item) =>
      item.shippingSnapshot?.status === "CONFIRMATION_REQUIRED",
  );
  const previousShippingTotal = repricedItems.reduce(
    (total, item) =>
      total + (item.shippingSnapshot?.previousShippingTotal ?? 0),
    0,
  );
  const updatedShippingTotal = repricedItems.reduce(
    (total, item) =>
      total + (item.shippingSnapshot?.updatedShippingTotal ?? 0),
    0,
  );
  const repricedGarmentItems = cartItems.filter(
    (item) =>
      item.pricingReview?.status === "CONFIRMATION_REQUIRED",
  );
  const previousGarmentTotal = repricedGarmentItems.reduce(
    (total, item) =>
      total +
      (item.pricingReview?.previousGarmentSubtotal ?? 0),
    0,
  );
  const updatedGarmentTotal = repricedGarmentItems.reduce(
    (total, item) =>
      total +
      (item.pricingReview?.updatedGarmentSubtotal ?? 0),
    0,
  );

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
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-serif">
                  Shopping Cart
                </h2>
                <p className="text-[10px] text-heritage-beige/70 mt-0.5">
                  {cartItems.length} custom items in your cart
                </p>
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
                  <h3 className="text-xs font-bold text-heritage-green uppercase tracking-wider">
                    Your Cart is Empty
                  </h3>
                  <p className="text-[11px] text-heritage-ink/70 leading-relaxed max-w-xs">
                    Craft custom Senator attire, Agbadas, or Boubous calibrated
                    to your specific AI-supported dimensions.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsCartOpen(false);
                    setActiveTab("design");
                  }}
                  className="px-5 py-2 rounded-xl bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                >
                  Open Design Studio
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {cartItems.map((item) => {
                  const itemTotal = Math.max(
                    0,
                    item.garment.totalPrice -
                      getStoredShippingCost(item.garment),
                  );
                  const isBatchItem = isBatchPricingRoute(item.batchType);
                  const normalizedDesign = filterDesignSelectionsForDecorativeFeatures(
                    item.design,
                    item.style,
                    item.garment,
                  );
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
                            {item.garment.type} (
                            {item.measurements.unit || "inch"})
                          </p>
                        </div>
                        <span className="text-xs font-bold text-heritage-green font-mono">
                          {currencySymbol}
                          {itemTotal.toFixed(2)}
                        </span>
                      </div>

                      {isBatchItem && (
                        <div className="rounded-xl border border-heritage-gold/25 bg-heritage-cream/30 px-3 py-2.5 text-[10px]">
                          <div className="flex items-center justify-between gap-3 font-semibold text-heritage-ink/80">
                            <span>Selected Clothing Price:</span>
                            <span className="font-mono font-bold text-heritage-green">
                              {currencySymbol}
                              {(item.garment.clothingPrice || 0).toFixed(2)}
                            </span>
                          </div>
                          <p className="mt-1 font-semibold text-heritage-green/70">
                            Includes fabric and sewing costs
                          </p>
                        </div>
                      )}

                      <div className="bg-heritage-cream/30 p-2.5 rounded-xl text-[10px] space-y-1 text-heritage-ink/75 font-sans">
                        {FabricCapacityEngine.normalizeFabricAllocations(item).length > 1 ? (
                          <div className="space-y-0.5">
                            {FabricCapacityEngine.normalizeFabricAllocations(item).map((alloc, idx) => (
                              <p key={alloc.id || idx}>
                                🎨 Fabric Selection {idx + 1}: <strong>{alloc.fabric.name} ({alloc.fabric.code})</strong>
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p>
                            🎨 Fabric:{" "}
                            <strong>
                              {item.fabric.name} ({item.fabric.code})
                            </strong>
                          </p>
                        )}
                        {item.design.lowerGarmentType && (
                          <p>
                            👖 Lower Garment Type:{" "}
                            <strong className="uppercase">
                              {item.design.lowerGarmentType === "trousers"
                                ? "Trouser"
                                : "Skirt"}
                            </strong>
                          </p>
                        )}
                        {(item.design.customDetailSnapshots?.length
                          ? item.design.customDetailSnapshots
                          : getCustomDetailSnapshots(
                              item.design,
                              customDetailCatalog,
                            )
                        ).map((selection) => {
                          const opt = {
                            ...selection,
                            id: selection.optionId,
                          };
                          return (
                            <p key={opt.id}>
                              🪡 {opt.selectionGroup.replace(/_/g, ' ')}: <strong>{opt.label}</strong>
                            </p>
                          );
                        })}
                        <p>
                          👤 Recipient: <strong>{item.customer.name}</strong>
                        </p>
                        {item.design.hasLining &&
                          !hasSelectedCustomDetailOption(
                            item.design,
                            DRESS_LINING_OPTION_ID,
                          ) && (
                          <p>
                            ✨ L5 Lining: <strong className="text-heritage-gold">Included (+€10.00)</strong>
                          </p>
                        )}
                        {item.design.optionalAccessories && item.design.optionalAccessories.length > 0 && (
                          <p>
                            💎 Accessories: <strong>{item.design.optionalAccessories.join(", ")}</strong>
                          </p>
                        )}
                        {item.design.decorativeFeatures &&
                          item.design.decorativeFeatures.length > 0 && (
                            <p>
                              Decorative details:{" "}
                              <strong>
                                {item.design.decorativeFeatures.join(", ")}
                              </strong>
                            </p>
                          )}
                        {normalizedDesign.monogramPlacement && (
                          <p>
                            Monogram placement:{" "}
                            <strong>
                              {getMonogramPlacementLabel(
                                normalizedDesign.monogramPlacement,
                              )}
                            </strong>
                          </p>
                        )}
                        {item.design.accessories &&
                          item.design.accessories.length > 0 && (
                            <p>
                              Traditional accessories:{" "}
                              <strong>{item.design.accessories.join(", ")}</strong>
                            </p>
                          )}
                        {item.batchType === "alone" && (
                          <p>
                            Shipping:{" "}
                            <strong>
                              Lagos to Eindhoven (
                              {item.garment.individualShipping?.garmentPieceCount ??
                                1}{" "}
                              garment piece
                              {(item.garment.individualShipping
                                ?.garmentPieceCount ?? 1) === 1
                                ? ""
                                : "s"}
                              )
                            </strong>
                          </p>
                        )}
                        {item.batchType !== "alone" && item.garment.batchShipping && (
                          <p>
                            Batch shipping:{" "}
                            <strong>
                              {item.garment.batchShipping.batchName} (
                              {item.garment.batchShipping.garmentPieceCount} garment
                              {item.garment.batchShipping.garmentPieceCount === 1
                                ? ""
                                : "s"}
                              )
                            </strong>
                          </p>
                        )}
                      </div>

                      <div className="border-t border-amber-200 pt-3 space-y-3">
                        {item.shippingSnapshot?.status ===
                          "REVIEW_REQUIRED" && (
                          <div className="text-[10px] text-amber-800">
                            <p className="font-bold">Review shipping details</p>
                            <p className="mt-0.5">
                              {item.shippingSnapshot.reviewReason ||
                                "Complete the delivery information before payment."}
                            </p>
                          </div>
                        )}
                        {shippingEditorItemId !== item.id ? (
                            <button
                              type="button"
                              onClick={() => openShippingEditor(item)}
                              className="text-[10px] font-bold text-heritage-green underline underline-offset-4 cursor-pointer"
                            >
                              {item.shippingSnapshot?.status ===
                              "REVIEW_REQUIRED"
                                ? "Review shipping details"
                                : "Edit order details"}
                            </button>
                          ) : (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-[9px] font-bold uppercase text-heritage-ink/60">
                                  Order route
                                  <select
                                    value={shippingEditorRoute}
                                    onChange={(event) =>
                                      setShippingEditorRoute(
                                        event.target.value as NonNullable<
                                          CartItem["batchType"]
                                        >,
                                      )
                                    }
                                    className="mt-1 min-h-[40px] w-full border border-gray-200 px-2 text-[10px] font-normal normal-case"
                                  >
                                    <option value="alone">
                                      Individual order
                                    </option>
                                    <option value="community">
                                      Community batch
                                    </option>
                                    <option value="personalized">
                                      Personalized batch
                                    </option>
                                    <option value="actual">
                                      Assigned batch
                                    </option>
                                  </select>
                                </label>
                                <label className="text-[9px] font-bold uppercase text-heritage-ink/60">
                                  Garment quantity
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={shippingEditorQuantity}
                                    onChange={(event) =>
                                      setShippingEditorQuantity(
                                        event.target.value,
                                      )
                                    }
                                    className="mt-1 min-h-[40px] w-full border border-gray-200 px-3 text-[10px] font-normal normal-case"
                                  />
                                </label>
                              </div>
                              {shippingEditorRoute !== "alone" && (
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    aria-label="Batch ID"
                                    placeholder="Batch ID"
                                    value={shippingEditorBatchId}
                                    onChange={(event) =>
                                      setShippingEditorBatchId(
                                        event.target.value,
                                      )
                                    }
                                    className="min-h-[40px] border border-gray-200 px-3 text-[10px]"
                                  />
                                  <input
                                    aria-label="Batch name"
                                    placeholder="Batch name"
                                    value={shippingEditorBatchName}
                                    onChange={(event) =>
                                      setShippingEditorBatchName(
                                        event.target.value,
                                      )
                                    }
                                    className="min-h-[40px] border border-gray-200 px-3 text-[10px]"
                                  />
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                {(["PICKUP", "DELIVERY"] as const).map(
                                  (method) => (
                                    <button
                                      key={method}
                                      type="button"
                                      onClick={() =>
                                        setShippingEditorMethod(method)
                                      }
                                      className={`min-h-[40px] border px-3 text-[9px] font-bold uppercase cursor-pointer ${
                                        shippingEditorMethod === method
                                          ? "border-heritage-gold bg-heritage-gold/10 text-heritage-green"
                                          : "border-gray-200 text-heritage-ink/60"
                                      }`}
                                    >
                                      {method === "PICKUP"
                                        ? "Eindhoven pickup"
                                        : "Deliver to address"}
                                    </button>
                                  ),
                                )}
                              </div>
                              {shippingEditorMethod === "DELIVERY" && (
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    aria-label="Address line 1"
                                    placeholder="Address line 1"
                                    value={shippingEditorAddress.addressLine1}
                                    onChange={(event) =>
                                      setShippingEditorAddress((current) => ({
                                        ...current,
                                        addressLine1: event.target.value,
                                      }))
                                    }
                                    className="col-span-2 min-h-[40px] border border-gray-200 px-3 text-[10px]"
                                  />
                                  <input
                                    aria-label="City"
                                    placeholder="City"
                                    value={shippingEditorAddress.city}
                                    onChange={(event) =>
                                      setShippingEditorAddress((current) => ({
                                        ...current,
                                        city: event.target.value,
                                      }))
                                    }
                                    className="min-h-[40px] border border-gray-200 px-3 text-[10px]"
                                  />
                                  <input
                                    aria-label="Postal code"
                                    placeholder="Postal code"
                                    value={shippingEditorAddress.postalCode}
                                    onChange={(event) =>
                                      setShippingEditorAddress((current) => ({
                                        ...current,
                                        postalCode: event.target.value,
                                      }))
                                    }
                                    className="min-h-[40px] border border-gray-200 px-3 text-[10px]"
                                  />
                                  <select
                                    aria-label="Country"
                                    value={shippingEditorAddress.countryCode}
                                    onChange={(event) =>
                                      setShippingEditorAddress((current) => ({
                                        ...current,
                                        countryCode: event.target.value,
                                      }))
                                    }
                                    className="col-span-2 min-h-[40px] border border-gray-200 px-3 text-[10px]"
                                  >
                                    {FINAL_MILE_COUNTRY_OPTIONS.map(
                                      (country) => (
                                        <option
                                          key={country.code}
                                          value={country.code}
                                        >
                                          {country.label}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </div>
                              )}
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => saveShippingDetails(item)}
                                  className="min-h-[40px] bg-heritage-green px-4 text-[9px] font-bold uppercase text-white cursor-pointer"
                                >
                                  Save shipping details
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShippingEditorItemId(null)
                                  }
                                  className="min-h-[40px] text-[9px] font-bold uppercase text-heritage-ink/60 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <span className="text-[9px] text-heritage-ink/40 font-semibold font-mono">
                          ID: {item.id.split("-").slice(0, 2).join("-")}
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
              {rerouteItemIds.map((itemId) => {
                const item = cartItems.find(
                  (candidate) => candidate.id === itemId,
                );
                if (!item) return null;
                return (
                  <div
                    key={itemId}
                    className="border-y border-amber-200 py-3 text-[10px] text-amber-900 space-y-2"
                  >
                    <p className="font-bold">
                      {item.batchName || "Community batch"} is no longer
                      joinable.
                    </p>
                    <p>Your garment design remains safely in the cart.</p>
                    <button
                      type="button"
                      onClick={() =>
                        continueAsIndividualOrder(itemId)
                      }
                      className="min-h-[40px] w-full bg-heritage-green px-4 text-[9px] font-bold uppercase tracking-wider text-white cursor-pointer"
                    >
                      Continue as individual order
                    </button>
                  </div>
                );
              })}
              {repricedGarmentItems.length > 0 && (
                <div className="border-y border-amber-200 py-3 text-[10px] text-amber-900 space-y-2">
                  <p className="font-bold uppercase tracking-wider">
                    Garment price updated
                  </p>
                  <div className="flex justify-between gap-3">
                    <span>Previous garment total:</span>
                    <span className="font-mono">
                      {currencySymbol}
                      {previousGarmentTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 font-bold">
                    <span>Updated garment total:</span>
                    <span className="font-mono">
                      {currencySymbol}
                      {updatedGarmentTotal.toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={acceptUpdatedGarmentPricing}
                    className="min-h-[40px] w-full bg-heritage-green px-4 text-[9px] font-bold uppercase tracking-wider text-white cursor-pointer"
                  >
                    Accept updated garment price
                  </button>
                </div>
              )}
              {repricedItems.length > 0 && (
                <div className="border-y border-amber-200 py-3 text-[10px] text-amber-900 space-y-2">
                  <p className="font-bold uppercase tracking-wider">
                    Shipping price updated
                  </p>
                  <div className="flex justify-between gap-3">
                    <span>Previous shipping:</span>
                    <span className="font-mono">
                      {currencySymbol}
                      {previousShippingTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 font-bold">
                    <span>Updated shipping:</span>
                    <span className="font-mono">
                      {currencySymbol}
                      {updatedShippingTotal.toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={acceptUpdatedShipping}
                    className="min-h-[40px] w-full bg-heritage-green px-4 text-[9px] font-bold uppercase tracking-wider text-white cursor-pointer"
                  >
                    Accept updated shipping
                  </button>
                </div>
              )}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-heritage-ink/70">
                  <span>
                    Garments ({cartItems.length} item
                    {cartItems.length > 1 ? "s" : ""}):
                  </span>
                  <span className="font-mono font-semibold text-heritage-green">
                    {currencySymbol}
                    {cartPricing.garmentSubtotal.toFixed(2)}
                  </span>
                </div>
                {cartPricing.individualShippingQuote && (
                  <div className="text-heritage-ink/70">
                    <div className="flex justify-between">
                      <span>Lagos &rarr; Eindhoven shipping:</span>
                      <span className="font-mono font-semibold text-heritage-green">
                        {currencySymbol}
                        {cartPricing.individualShippingQuote.priceEur.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[9px] text-heritage-ink/45 mt-0.5">
                      {cartPricing.individualShippingQuote.garmentPieceCount} garment piece
                      {cartPricing.individualShippingQuote.garmentPieceCount === 1
                        ? ""
                        : "s"}{" "}
                      · {cartPricing.individualShippingQuote.estimatedWeightKg.toFixed(2)} kg
                      estimated · {cartPricing.individualShippingQuote.weightBand}
                    </p>
                  </div>
                )}
                {cartPricing.batchShippingQuotes.map((quote) => (
                  <div key={quote.batchId} className="text-heritage-ink/70">
                    <div className="flex justify-between">
                      <span>
                        Lagos &rarr; Eindhoven · {quote.batchName}:
                      </span>
                      <span className="font-mono font-semibold text-heritage-green">
                        {currencySymbol}
                        {quote.priceEur.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[9px] text-heritage-ink/45 mt-0.5">
                      {quote.garmentPieceCount} garment piece
                      {quote.garmentPieceCount === 1 ? "" : "s"} ·{" "}
                      {currencySymbol}
                      {quote.exactRateEurPerGarment.toFixed(2)} each ·{" "}
                      {quote.minimumBatchGarments ??
                        BATCH_MINIMUM_GARMENTS}
                      -garment batch minimum
                      {quote.allowsSplitShipments
                        ? " · split shipments available for large batches"
                        : ""}
                    </p>
                  </div>
                ))}
                {cartPricing.finalMileShippingQuotes.map((quote) => (
                  <div
                    key={quote.shipmentGroupId}
                    className="text-heritage-ink/70"
                  >
                    <div className="flex justify-between gap-3">
                      <span>
                        {quote.method === "PICKUP"
                          ? `${quote.pickupLocation || "Configured location"} pickup:`
                          : quote.status === "READY"
                            ? `Eindhoven → ${quote.zoneLabel} (${quote.weightBand}):`
                            : "Eindhoven → final destination:"}
                      </span>
                      <span
                        className={`text-right font-semibold ${
                          quote.status === "READY"
                            ? "font-mono text-heritage-green"
                            : "text-amber-700"
                        }`}
                      >
                        {quote.status === "READY"
                          ? `${currencySymbol}${(quote.priceEur ?? 0).toFixed(2)}`
                          : quote.status === "MANUAL_QUOTE_REQUIRED"
                            ? "Quote required"
                            : "Delivery selection required"}
                      </span>
                    </div>
                    {quote.status !== "READY" && (
                      <p className="mt-0.5 text-[9px] text-amber-700">
                        {quote.manualQuoteReason ||
                          "Return to Design Studio Step 7 to select final delivery."}
                      </p>
                    )}
                  </div>
                ))}
                <div className="flex justify-between text-heritage-ink/70 border-t pt-2">
                  <span>Total shipping:</span>
                  <span className="font-mono font-semibold text-heritage-green">
                    {cartPricing.totalShipping === null
                      ? "Pending quote"
                      : `${currencySymbol}${cartPricing.totalShipping.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between text-heritage-ink/70 border-t pt-2">
                  <span>Total subtotal:</span>
                  <span className="font-mono font-semibold text-heritage-green">
                    {subtotal === null
                      ? "Pending quote"
                      : `${currencySymbol}${subtotal.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between text-heritage-ink/70">
                  <span>
                    Due now (
                    {depositPercentage}%
                    garment deposit
                    {cartPricing.totalShipping !== null &&
                    cartPricing.totalShipping > 0
                      ? " + full shipping"
                      : ""}
                    ):
                  </span>
                  <span className="font-mono font-semibold text-heritage-gold">
                    {depositAmount === null
                      ? "Unavailable"
                      : `${currencySymbol}${depositAmount.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-sm text-heritage-green border-t pt-2 font-serif">
                  <span>Total checkout deposit:</span>
                  <span className="font-mono">
                    {depositAmount === null
                      ? "Unavailable"
                      : `${currencySymbol}${depositAmount.toFixed(2)}`}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-heritage-cream/50 border border-heritage-gold/15 rounded-xl text-[9px] leading-relaxed text-heritage-ink/75 flex items-start gap-2">
                <span className="text-heritage-gold text-xs leading-none">
                  🛡️
                </span>
                <div>
                  <strong>Heritage Escrow System:</strong> Your{" "}
                  {depositPercentage}% garment
                  deposit
                  {cartPricing.totalShipping !== null &&
                  cartPricing.totalShipping > 0
                    ? " and full shipping payment"
                    : ""}{" "}
                  activate our Lagos workshop immediately. The final{" "}
                  {100 - depositPercentage}%
                  garment balance remains due at delivery.
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={!cartPricing.canCheckout}
                className="w-full bg-heritage-gold text-heritage-forest hover:bg-heritage-green hover:text-white transition py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CreditCard size={12} />{" "}
                {!cartPricing.canCheckout
                  ? cartPricing.requiresShippingReview
                    ? "Review Shipping Details"
                    : cartPricing.requiresPriceConfirmation
                      ? "Confirm Updated Garment Price"
                    : cartPricing.requiresShippingConfirmation
                      ? "Confirm Updated Shipping"
                      : cartPricing.shippingStatus === "MANUAL_QUOTE_REQUIRED"
                        ? "Shipping Quote Required"
                        : "Complete Final Delivery"
                  : "Proceed to Checkout"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
