import { z } from "zod";
import { t } from "@/i18n";

const email = z.string().trim().toLowerCase().pipe(z.email({ error: t.validation.email }));

export const passwordSchema = z
  .string()
  .min(8, { error: t.validation.passwordMin })
  .max(72) // bcrypt sınırı
  .refine((v) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(v) && /\d/.test(v), { error: t.validation.passwordStrength });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: t.validation.passwordMin }).max(72),
});

export const signupSchema = z.object({
  fullName: z.string().trim().max(120, { error: t.validation.nameMax }).optional().transform((v) => v || undefined),
  email,
  password: passwordSchema,
});

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { error: t.auth.passwordsDontMatch, path: ["confirm"] });

export const profileSchema = z.object({
  fullName: z.string().trim().max(120, { error: t.validation.nameMax }).transform((v) => v || null),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v || null)
    .pipe(z.string().regex(/^[a-z0-9_.]{3,30}$/, { error: t.validation.username }).nullable()),
});

export type FieldErrors = Partial<Record<string, string>>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
