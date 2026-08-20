import { z } from 'zod';

// Client-side mirrors of the backend DTO rules (apps/auth-service/src/auth/dto/*).
// Keeping the numeric limits in this one file makes it easy to bump both sides
// together — a mismatch here shows up as "field passed client validation but
// got 400 from the server" which is a bad UX signal.

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email();

// Length only. Strength (zxcvbn ≥ 3) and breach corpus (HIBP) are enforced
// server-side and reported back via WEAK_PASSWORD / PASSWORD_PWNED codes —
// duplicating those checks in the client would be lying (the client can't
// call HIBP privately, and zxcvbn client-side is only a UX hint).
export const passwordSchema = z.string().min(12, 'auth.errors.passwordTooShort');

// Login accepts any non-empty string — a user whose password predates a
// stricter rule must still be able to authenticate to rotate it.
export const loginPasswordSchema = z.string().min(1);

export const displayNameSchema = z.string().trim().min(1).max(100);

export const codeSchema = z.string().regex(/^\d{6}$/, 'auth.errors.codeFormat');

export const registerSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});
export type RegisterFormValues = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  code: codeSchema,
});
export type VerifyEmailFormValues = z.infer<typeof verifyEmailSchema>;

/**
 * Confirm-password is not sent to the server — it's a client-only guard to
 * catch typos before the request. Using `superRefine` (rather than `refine`)
 * so the error attaches to the `confirmPassword` field specifically.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: loginPasswordSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'auth.errors.confirmMismatch',
      });
    }
  });
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
