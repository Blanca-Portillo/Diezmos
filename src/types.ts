export type Section = 'inicio' | 'servicios' | 'miembros' | 'grupos' | 'recursos' | 'tesoreria' | 'pastoral';
export type RecordValue = string | number | boolean | null;
export type ChurchRecord = Record<string, RecordValue>;

export interface Field {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'datetime-local' | 'number' | 'email' | 'select' | 'textarea';
  required?: boolean;
  options?: string[];
  dynamic?: 'members';
  private?: boolean;
}

export interface ModuleDefinition {
  section: Section;
  title: string;
  singular: string;
  description: string;
  endpoint: string;
  permission: string;
  fields: Field[];
  columns: string[];
}
