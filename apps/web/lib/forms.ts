import type { ZodTypeAny, z } from 'zod';

export type FieldErrors = Record<string, string | undefined>;

/** Validates with a shared schema and returns the first message per field. */
export function validate<T extends ZodTypeAny>(
  schema: T,
  values: unknown,
): { data: z.infer<T>; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: FieldErrors = {};
  for (const [field, messages] of Object.entries(result.error.flatten().fieldErrors)) {
    errors[field] = (messages as string[] | undefined)?.[0];
  }
  return { data: null, errors };
}

export function firstErrors(fieldErrors: Record<string, string[]>): FieldErrors {
  return Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]]));
}
