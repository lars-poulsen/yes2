import type { SubscriptionStatus } from "./user";

type SubscriptionUpdateInput = {
  userId: string;
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  stripeCustomerId?: string | null;
};

export const updateSubscriptionStatus = async (
  input: SubscriptionUpdateInput
): Promise<void> => {
  // TODO: Wire up to backend persistence for Stripe webhooks.
  void input;
  return Promise.resolve();
};
