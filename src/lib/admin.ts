export type AdminUser = {
  id: string;
  email: string;
  role: "user" | "admin";
  created_at: string;
  blocked_at: string | null;
  free_questions_remaining: number;
  free_period_ends_at: string | null;
};

const withAuthHeaders = (options: RequestInit = {}) => {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return { ...options, headers, credentials: "include" as const };
};

export const fetchAdminUsers = async (): Promise<AdminUser[]> => {
  const response = await fetch("/api/admin/users", withAuthHeaders());
  if (!response.ok) {
    throw new Error("Kunne ikke hente brugere");
  }
  const data = (await response.json()) as { users: AdminUser[] };
  return data.users;
};

export const updateUserEntitlements = async (
  userId: string,
  input: { freeQuestionsRemaining?: number; freePeriodEndsAt?: string | null }
): Promise<void> => {
  const response = await fetch(`/api/admin/users/${userId}/entitlements`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Kunne ikke opdatere bruger");
  }
};

export const blockAdminUser = async (userId: string): Promise<void> => {
  const response = await fetch(`/api/admin/users/${userId}/block`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Kunne ikke blokere bruger");
  }
};

export const unblockAdminUser = async (userId: string): Promise<void> => {
  const response = await fetch(`/api/admin/users/${userId}/unblock`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Kunne ikke afblokere bruger");
  }
};

export const deleteAdminUser = async (userId: string): Promise<void> => {
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Kunne ikke slette bruger");
  }
};
