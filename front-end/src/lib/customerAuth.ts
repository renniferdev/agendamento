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

export function logoutCustomer(slug: string): Promise<void> {
  return api<void>(`/establishments/${slug}/customers/logout`, { method: "POST" });
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
