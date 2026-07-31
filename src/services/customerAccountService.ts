import type { Customer } from "../types";
import { AuthorizationEngine } from "../engine/AuthorizationEngine";

export function findCustomerByEmail(
  customers: Customer[],
  email: string,
): Customer | undefined {
  const canonicalEmail = AuthorizationEngine.getCanonicalEmail(email);
  return customers.find(
    (customer) =>
      AuthorizationEngine.getCanonicalEmail(customer.email) ===
      canonicalEmail,
  );
}

export function resolveGoogleCustomer(
  customers: Customer[],
  identity: {
    email: string;
    displayName?: string | null;
    phoneNumber?: string | null;
  },
) {
  const canonicalEmail = AuthorizationEngine.getCanonicalEmail(identity.email);
  const existing = findCustomerByEmail(customers, canonicalEmail);
  if (existing) {
    return {
      customer: {
        ...existing,
        email: canonicalEmail,
        role: AuthorizationEngine.resolveRole(existing),
      },
      customers,
      created: false,
    };
  }

  const customer: Customer = {
    name: identity.displayName?.trim() || "Google Customer",
    email: canonicalEmail,
    phone: identity.phoneNumber || "",
    role: AuthorizationEngine.resolveRole({
      name: identity.displayName || "Google Customer",
      email: canonicalEmail,
      phone: identity.phoneNumber || "",
    }),
    orderStatus: "Fresh Passport Activation",
    method: "gmail",
  };
  return {
    customer,
    customers: [...customers, customer],
    created: true,
  };
}
