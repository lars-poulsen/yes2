export type BillingPlan = {
  name: string | null;
  amount: number | null;
  currency: string | null;
  interval: string | null;
};

export type BillingConfig = {
  provider: "stripe";
  publishableKey: string | null;
  priceId: string | null;
  successUrl: string | null;
  cancelUrl: string | null;
  plan: BillingPlan;
};

export type BillingSettingsInput = {
  stripePriceId?: string | null;
  stripePublishableKey?: string | null;
  successUrl?: string | null;
  cancelUrl?: string | null;
  stripePortalReturnUrl?: string | null;
  openaiModel?: string | null;
  planName?: string | null;
  planAmount?: number | null;
  planCurrency?: string | null;
  planInterval?: string | null;
};

const withAuthHeaders = (options: RequestInit = {}) => {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return { ...options, headers, credentials: "include" as const };
};

export const fetchBillingConfig = async (): Promise<BillingConfig> => {
  const response = await fetch("/api/billing/config", withAuthHeaders());
  if (!response.ok) {
    throw new Error("Kunne ikke hente betalingskonfiguration");
  }
  return (await response.json()) as BillingConfig;
};

export const createCheckoutSession = async (): Promise<{ url: string }> => {
  const response = await fetch(
    "/api/billing/checkout-session",
    withAuthHeaders({ method: "POST" })
  );
  if (!response.ok) {
    throw new Error("Kunne ikke starte betaling");
  }
  return (await response.json()) as { url: string };
};

export const createPortalSession = async (): Promise<{ url: string }> => {
  const response = await fetch(
    "/api/billing/portal-session",
    withAuthHeaders({ method: "POST" })
  );
  if (!response.ok) {
    throw new Error("Kunne ikke åbne abonnement");
  }
  return (await response.json()) as { url: string };
};

export const fetchBillingSettings = async (): Promise<{
  stripePriceId: string | null;
  stripePublishableKey: string | null;
  successUrl: string | null;
  cancelUrl: string | null;
  stripePortalReturnUrl: string | null;
  plan: BillingPlan;
  openaiModel: string | null;
}> => {
  const response = await fetch("/api/admin/billing/settings", withAuthHeaders());
  if (!response.ok) {
    throw new Error("Kunne ikke hente Stripe-indstillinger");
  }
  return (await response.json()) as {
    stripePriceId: string | null;
    stripePublishableKey: string | null;
    successUrl: string | null;
    cancelUrl: string | null;
    stripePortalReturnUrl: string | null;
    plan: BillingPlan;
    openaiModel: string | null;
  };
};

export const updateBillingSettings = async (
  input: BillingSettingsInput
): Promise<void> => {
  const response = await fetch("/api/admin/billing/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Kunne ikke gemme Stripe-indstillinger");
  }
};
