import { api } from "./api";

export interface CustomerSession {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export function getCustomerMe(slug: string): Promise<CustomerSession> {
  return api<CustomerSession>(`/establishments/${slug}/customers/me`);
}

export function loginCustomer(slug: string, email: string, password: string): Promise<CustomerSession> {
  return api<CustomerSession>(`/establishments/${slug}/customers/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function registerCustomer(
  slug: string,
  data: { name: string; phone: string; email: string; password: string; confirmPassword: string }
): Promise<CustomerSession> {
  return api<CustomerSession>(`/establishments/${slug}/customers/register`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Conta Google nova: falta o telefone, que o Google não informa. */
export interface GooglePendingProfile {
  needsPhone: true;
  name: string;
  email: string;
}

export function googleSignInCustomer(
  slug: string,
  credential: string,
  phone?: string
): Promise<CustomerSession | GooglePendingProfile> {
  return api(`/establishments/${slug}/customers/google`, {
    method: "POST",
    body: JSON.stringify({ credential, phone }),
  });
}

export function logoutCustomer(slug: string): Promise<void> {
  return api<void>(`/establishments/${slug}/customers/logout`, { method: "POST" });
}

export function forgotPasswordCustomer(slug: string, email: string): Promise<{ message: string }> {
  return api(`/establishments/${slug}/customers/forgot-password`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPasswordCustomer(
  slug: string,
  data: { token: string; password: string; confirmPassword: string }
): Promise<{ message: string }> {
  return api(`/establishments/${slug}/customers/reset-password`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type CustomerAppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

export interface CustomerAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: CustomerAppointmentStatus;
  service: { name: string; durationMinutes: number; priceCents: number };
}

export function getCustomerAppointments(slug: string): Promise<CustomerAppointment[]> {
  return api<CustomerAppointment[]>(`/establishments/${slug}/customers/me/appointments`);
}
