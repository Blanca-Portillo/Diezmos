import type { ModuleDefinition, Section } from './types';

export const sections: { id: Section; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Inicio y reportes', icon: '⌂' },
  { id: 'servicios', label: 'Servicios y asistencia', icon: '◷' },
  { id: 'miembros', label: 'Miembros', icon: '♙' },
  { id: 'grupos', label: 'Grupos', icon: '♧' },
  { id: 'recursos', label: 'Predicaciones y recursos', icon: '▤' },
  { id: 'tesoreria', label: 'Tesorería', icon: '$' },
  { id: 'pastoral', label: 'Seguimiento pastoral', icon: '♡' }
];

export const modules: Partial<Record<Section, ModuleDefinition>> = {
  miembros: {
    section: 'miembros', title: 'Miembros', singular: 'miembro', endpoint: 'members',
    permission: 'Admin', description: 'Directorio privado y datos de contacto.',
    fields: [
      { key: 'full_name', label: 'Nombre completo', required: true },
      { key: 'phone', label: 'Teléfono', type: 'text' },
      { key: 'email', label: 'Correo', type: 'email' },
      { key: 'status', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo', 'Visitante'] },
      { key: 'joined_on', label: 'Fecha de ingreso', type: 'date' }
    ], columns: ['full_name', 'phone', 'email', 'status', 'joined_on']
  },
  grupos: {
    section: 'grupos', title: 'Grupos', singular: 'grupo', endpoint: 'groups',
    permission: 'Admin', description: 'Grupos y ministerios de la congregación.',
    fields: [
      { key: 'name', label: 'Nombre del grupo', required: true },
      { key: 'description', label: 'Descripción', type: 'textarea' },
      { key: 'leader_name', label: 'Responsable' },
      { key: 'meeting_schedule', label: 'Horario de reunión' },
      { key: 'active', label: 'Estado', type: 'select', options: ['Activo', 'Inactivo'] }
    ], columns: ['name', 'leader_name', 'meeting_schedule', 'active']
  },
  servicios: {
    section: 'servicios', title: 'Servicios y asistencia', singular: 'servicio', endpoint: 'services',
    permission: 'Admin', description: 'Horarios, actividades y registros de asistencia.',
    fields: [
      { key: 'name', label: 'Nombre del servicio', required: true },
      { key: 'starts_at', label: 'Fecha y hora', type: 'datetime-local', required: true },
      { key: 'location', label: 'Lugar' },
      { key: 'notes', label: 'Notas', type: 'textarea' }
    ], columns: ['name', 'starts_at', 'location']
  },
  recursos: {
    section: 'recursos', title: 'Predicaciones y recursos', singular: 'recurso', endpoint: 'resources',
    permission: 'Admin', description: 'Metadatos y archivos privados de predicaciones.',
    fields: [
      { key: 'title', label: 'Título', required: true },
      { key: 'preached_on', label: 'Fecha', type: 'date' },
      { key: 'speaker', label: 'Predicador' },
      { key: 'description', label: 'Descripción', type: 'textarea' }
    ], columns: ['title', 'preached_on', 'speaker', 'file_name']
  },
  tesoreria: {
    section: 'tesoreria', title: 'Tesorería', singular: 'movimiento', endpoint: 'treasury',
    permission: 'Treasury', description: 'Registro interno de ingresos y egresos en USD.',
    fields: [
      { key: 'direction', label: 'Operación', type: 'select', options: ['Ingreso', 'Egreso'], required: true },
      { key: 'category', label: 'Categoría (Diezmo, Ofrenda u otra)', required: true },
      { key: 'amount', label: 'Monto (USD)', type: 'number', required: true },
      { key: 'occurred_on', label: 'Fecha', type: 'date', required: true },
      { key: 'description', label: 'Descripción' },
      { key: 'member_id', label: 'Miembro asociado (opcional)', type: 'select', dynamic: 'members' }
    ], columns: ['occurred_on', 'direction', 'category', 'description', 'member_name', 'amount']
  },
  pastoral: {
    section: 'pastoral', title: 'Seguimiento pastoral', singular: 'seguimiento', endpoint: 'pastoral',
    permission: 'Pastoral', description: 'Información confidencial: acceso solo para personal pastoral autorizado.',
    fields: [
      { key: 'subject', label: 'Persona / asunto', required: true },
      { key: 'follow_up_on', label: 'Fecha', type: 'date', required: true },
      { key: 'assigned_to', label: 'Responsable', required: true },
      { key: 'status', label: 'Estado', type: 'select', options: ['Pendiente', 'En seguimiento', 'Cerrado'] },
      { key: 'notes', label: 'Nota confidencial', type: 'textarea', private: true, required: true }
    ], columns: ['subject', 'follow_up_on', 'assigned_to', 'status']
  }
};

export const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:7071/api';
