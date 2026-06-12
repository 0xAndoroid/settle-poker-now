import { ApiError } from './apiClient';

export function errorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export function errorStatus(err: unknown): number | null {
  return err instanceof ApiError ? err.status : null;
}
