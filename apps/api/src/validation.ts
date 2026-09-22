import type { z } from 'zod';
import { ValidationError } from './errors';

export function formatIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** Parses untrusted request input, turning failures into a 400 VALIDATION_ERROR. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(formatIssues(result.error));
  return result.data;
}
