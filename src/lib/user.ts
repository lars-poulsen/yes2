export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";

export type User = {
  id: string;
  email: string;
  role: "user" | "admin";
  created_at: string;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  free_questions_remaining: number;
  free_period_ends_at: string | null;
};

export const fetchCurrentUser = async (): Promise<User> => {
  const response = await fetch("/api/users/me", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Kunne ikke hente bruger");
  }
  return (await response.json()) as User;
};
