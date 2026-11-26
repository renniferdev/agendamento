import { z } from "zod";

/** Telefone brasileiro com DDD, armazenado só com dígitos. */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 10 || v.length === 11, "Telefone deve ter DDD + número (10 ou 11 dígitos)");
