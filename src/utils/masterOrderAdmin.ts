const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const legacyTrackingId = (order: unknown): string | undefined => {
  if (!isRecord(order) || !isRecord(order.shipment)) return undefined;
  const trackingId = order.shipment.trackingId;
  return typeof trackingId === "string" && trackingId.trim()
    ? trackingId.trim()
    : undefined;
};

export const replaceOrderByTrackingId = <T,>(
  orders: readonly T[],
  trackingId: string,
  next: T,
): T[] =>
  orders.map((order) => (legacyTrackingId(order) === trackingId ? next : order));

export const applyCustomerDetailsToMatchingOrders = <T,>(
  orders: readonly T[],
  customer: {
    email: string;
    name: string;
    phone?: string;
    location?: string;
  },
): T[] => {
  const email = customer.email.toLowerCase();
  return orders.map((order) => {
    if (!isRecord(order) || !isRecord(order.customer)) return order;
    const orderEmail = order.customer.email;
    if (typeof orderEmail !== "string" || orderEmail.toLowerCase() !== email) {
      return order;
    }
    return {
      ...order,
      customer: {
        ...order.customer,
        name: customer.name,
        phone: customer.phone,
        location: customer.location,
      },
    } as T;
  });
};

export const formatAdminShippingStatus = (status: unknown): string =>
  typeof status === "string" && status.length > 0
    ? status.replaceAll("_", " ")
    : "—";

const textOrDash = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value : "—";

export interface LegacyMasterOrderRow {
  readonly trackingId: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly fabricName: string;
  readonly fabricCode: string;
  readonly fabricColor: string;
  readonly styleName: string;
  readonly outfitType: string;
  readonly composition: string;
  readonly batchType: string;
  readonly paymentLabel: string;
  readonly stage: number;
  readonly status: string;
  readonly totalLabel: string;
  readonly date: string;
  readonly canMutate: boolean;
}

export const presentLegacyMasterOrderRow = (order: unknown): LegacyMasterOrderRow => {
  const source = isRecord(order) ? order : {};
  const shipment = isRecord(source.shipment) ? source.shipment : {};
  const customer = isRecord(source.customer) ? source.customer : {};
  const fabric = isRecord(source.fabric) ? source.fabric : {};
  const style = isRecord(source.style) ? source.style : {};
  const garment = isRecord(source.garment) ? source.garment : {};
  const payment = isRecord(source.payment) ? source.payment : {};
  const trackingId = legacyTrackingId(source);
  const totalNumber = Number(garment.totalPrice ?? payment.subtotal ?? 0);
  const stage = Number(shipment.currentStage);
  return {
    trackingId: trackingId || "—",
    customerName: textOrDash(customer.name ?? customer.fullName),
    customerEmail: textOrDash(customer.email),
    fabricName: textOrDash(fabric.name),
    fabricCode: typeof fabric.code === "string" ? fabric.code : "",
    fabricColor: typeof fabric.colorHex === "string" ? fabric.colorHex : "transparent",
    styleName: textOrDash(style.name),
    outfitType: textOrDash(style.outfitType ?? garment.type),
    composition:
      typeof style.garmentComposition === "string" && style.garmentComposition
        ? style.garmentComposition
        : "Standard",
    batchType: typeof source.batchType === "string" && source.batchType ? source.batchType : "batch",
    paymentLabel: payment.isPaid === true ? "Deposit Paid" : "Unpaid",
    stage: Number.isFinite(stage) && stage > 0 ? stage : 1,
    status: textOrDash(shipment.status),
    totalLabel: Number.isFinite(totalNumber) ? totalNumber.toFixed(2) : "0.00",
    date: textOrDash(payment.date),
    canMutate: Boolean(trackingId),
  };
};

export const ensureLegacyOrderEditorShape = (
  order: unknown,
): Record<string, unknown> => {
  const source = isRecord(order) ? order : {};
  const customer = isRecord(source.customer) ? source.customer : {};
  const style = isRecord(source.style) ? source.style : {};
  const fabric = isRecord(source.fabric) ? source.fabric : {};
  const garment = isRecord(source.garment) ? source.garment : {};
  const payment = isRecord(source.payment) ? source.payment : {};
  const shipment = isRecord(source.shipment) ? source.shipment : {};
  const currentStage = Number(shipment.currentStage);
  return {
    ...source,
    customer: {
      name: "",
      email: "",
      phone: "",
      location: "",
      ...customer,
    },
    style: { id: "", name: "", ...style },
    fabric: { code: "", name: "", ...fabric },
    garment: { type: "", totalPrice: 0, ...garment },
    payment: {
      subtotal: 0,
      deposit: 0,
      remaining: 0,
      method: "",
      date: "",
      isPaid: false,
      ...payment,
    },
    shipment: {
      ...shipment,
      trackingId: typeof shipment.trackingId === "string" ? shipment.trackingId : "",
      status: typeof shipment.status === "string" ? shipment.status : "",
      currentStage: Number.isFinite(currentStage) && currentStage > 0 ? currentStage : 1,
      estimatedDeliveryDate:
        typeof shipment.estimatedDeliveryDate === "string"
          ? shipment.estimatedDeliveryDate
          : "",
    },
  };
};
