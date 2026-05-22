import { ApiError } from './apiClient';

export function errorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
