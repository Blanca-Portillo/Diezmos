import { apiBase } from './config';
import type { ChurchRecord } from './types';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

const demoStore: Record<string, ChurchRecord[]> = {
  members: [
    { id: 'm1', full_name: 'María Gómez', phone: '7876-1234', email: 'maria@ejemplo.org', status: 'Activo', joined_on: '2024-01-14' },
    { id: 'm2', full_name: 'Carlos Martínez', phone: '7050-2468', email: 'carlos@ejemplo.org', status: 'Activo', joined_on: '2023-08-20' },
    { id: 'm3', full_name: 'Ana Rivera', phone: '7789-0145', email: 'ana@ejemplo.org', status: 'Visitante', joined_on: '2026-11-10' }
  ],
  groups: [
    { id: 'g1', name: 'Jóvenes', description: 'Ministerio juvenil', leader_name: 'Carlos Martínez', meeting_schedule: 'Viernes 6:30 p. m.', active: true },
    { id: 'g2', name: 'Damas', description: 'Ministerio de damas', leader_name: 'María Gómez', meeting_schedule: 'Sábado 9:00 a. m.', active: true }
  ],
  services: [
    { id: 's1', name: 'Culto de domingo', starts_at: '2026-11-22T10:00:00', location: 'Templo principal', notes: 'Servicio general' },
    { id: 's2', name: 'Estudio bíblico', starts_at: '2026-11-25T19:00:00', location: 'Salón 2', notes: 'Estudio semanal' }
  ],
  attendance: [
    { id: 'a1', service_id: 's1', service_name: 'Culto de domingo', member_id: 'm1', member_name: 'María Gómez', attended_on: '2026-11-22', status: 'Presente' },
    { id: 'a2', service_id: 's1', service_name: 'Culto de domingo', member_id: 'm2', member_name: 'Carlos Martínez', attended_on: '2026-11-22', status: 'Presente' }
  ],
  memberships: [
    { id: 'ms1', group_id: 'g1', group_name: 'Jóvenes', member_id: 'm2', member_name: 'Carlos Martínez' },
    { id: 'ms2', group_id: 'g2', group_name: 'Damas', member_id: 'm1', member_name: 'María Gómez' }
  ],
  resources: [
    { id: 'r1', title: 'La esperanza en Cristo', preached_on: '2026-11-22', speaker: 'Pastor encargado', description: 'Archivo demostrativo', file_name: '' }
  ],
  treasury: [
    { id: 't1', direction: 'Ingreso', category: 'Diezmo', amount: 350, occurred_on: '2026-11-22', description: 'Registro demostrativo', member_id: 'm1', member_name: 'María Gómez' },
    { id: 't2', direction: 'Ingreso', category: 'Ofrenda', amount: 180, occurred_on: '2026-11-22', description: 'Servicio dominical', member_id: '', member_name: '' },
    { id: 't3', direction: 'Egreso', category: 'Servicios', amount: 95, occurred_on: '2026-11-20', description: 'Consumo eléctrico', member_id: '', member_name: '' }
  ],
  pastoral: [
    { id: 'p1', subject: 'Caso demostrativo', follow_up_on: '2026-11-24', assigned_to: 'Ministerio pastoral', status: 'En seguimiento', notes: 'Datos ficticios para revisar la interfaz.' }
  ]
};

function demoList(entity: string): ChurchRecord[] {
  return demoStore[entity] ? [...demoStore[entity]] : [];
}

function demoId(entity: string) {
  return `${entity}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isDemoToken(token?: string) {
  return token === 'demo-local-session';
}

async function demoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const [route, id] = path.split('/');
  const method = init?.method || 'GET';
  if (path.startsWith('reports')) {
    const income = demoStore.treasury.filter(row => row.direction === 'Ingreso').reduce((sum, row) => sum + Number(row.amount), 0);
    const expense = demoStore.treasury.filter(row => row.direction === 'Egreso').reduce((sum, row) => sum + Number(row.amount), 0);
    return {
      active_members: demoStore.members.filter(row => row.status === 'Activo').length,
      services_count: demoStore.services.length,
      attendance_count: demoStore.attendance.length,
      income_total: income,
      expense_total: expense,
      balance: income - expense,
      income_by_category: [
        { category: 'Diezmo', total: 350 },
        { category: 'Ofrenda', total: 180 }
      ]
    } as T;
  }
  if (method === 'GET') return demoList(route) as T;
  if (method === 'POST') {
    const record = JSON.parse(String(init?.body || '{}')) as ChurchRecord;
    const created: ChurchRecord = { id: demoId(route), ...record };
    if (route === 'attendance') {
      const service = demoStore.services.find(row => String(row.id) === String(record.service_id));
      const member = demoStore.members.find(row => String(row.id) === String(record.member_id));
      created.service_name = service?.name || '';
      created.member_name = member?.full_name || '';
    }
    if (route === 'memberships') {
      const group = demoStore.groups.find(row => String(row.id) === String(record.group_id));
      const member = demoStore.members.find(row => String(row.id) === String(record.member_id));
      created.group_name = group?.name || '';
      created.member_name = member?.full_name || '';
    }
    if (route === 'treasury') {
      const member = demoStore.members.find(row => String(row.id) === String(record.member_id));
      created.member_name = member?.full_name || '';
    }
    if (!demoStore[route]) demoStore[route] = [];
    demoStore[route].push(created);
    return created as T;
  }
  if (method === 'PUT' && id) {
    const record = JSON.parse(String(init?.body || '{}')) as ChurchRecord;
    const index = demoStore[route].findIndex(row => String(row.id) === id);
    if (index >= 0) demoStore[route][index] = { ...demoStore[route][index], ...record };
    return demoStore[route][index] as T;
  }
  if (method === 'DELETE' && id) {
    demoStore[route] = demoStore[route].filter(row => String(row.id) !== id);
    return undefined as T;
  }
  throw new ApiError('Operación demostrativa no admitida.', 400);
}

export async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  if (isDemoToken(token)) return demoRequest<T>(path, init);
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
