import { apiBase } from './config';
import type { ChurchRecord } from './types';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(body || `Error de servicio (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  list: (entity: string, token?: string) => request<ChurchRecord[]>(entity, token),
  create: (entity: string, record: ChurchRecord, token?: string) =>
    request<ChurchRecord>(entity, token, { method: 'POST', body: JSON.stringify(record) }),
  update: (entity: string, id: string, record: ChurchRecord, token?: string) =>
    request<ChurchRecord>(`${entity}/${id}`, token, { method: 'PUT', body: JSON.stringify(record) }),
  delete: (entity: string, id: string, token?: string) =>
    request<void>(`${entity}/${id}`, token, { method: 'DELETE' }),
  report: (from: string, to: string, token?: string) =>
    request<ChurchRecord>(`reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token)
};
