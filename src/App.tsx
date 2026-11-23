import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  DialogTrigger, Input, Select, Textarea, Tooltip
} from '@fluentui/react-components';
import { AddRegular, ArrowDownloadRegular, ArrowUploadRegular, DeleteRegular, EditRegular, SignOutRegular } from '@fluentui/react-icons';
import { api, request, ApiError } from './api';
import { modules, sections } from './config';
import type { ChurchRecord, Field, Section } from './types';

interface Props {
  token?: string;
  userName?: string;
  authError?: string;
  onSignIn?: () => void;
  onSignOut?: () => void;
  onAuthError?: (message: string) => void;
}

const dateToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
const currency = new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' });
const displayDate = (value: unknown) => {
  if (!value) return '—';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeZone: 'America/El_Salvador' })
      .format(new Date(year, month - 1, day, 12));
  }
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat('es-SV', {
    dateStyle: 'medium', timeZone: 'America/El_Salvador'
  }).format(date);
};

function Login({ configured, onSignIn, authError }: { configured: boolean; onSignIn?: () => void; authError?: string }) {
  return <main className="login-page">
    <section className="login-card">
      <div className="brand"><div className="brand-mark">✦</div><div>Diezmos<small>Administración de iglesia local</small></div></div>
      <h1>Portal administrativo</h1>
      <p>Acceso privado para el equipo autorizado. Los datos se consultan y guardan en la API de la iglesia.</p>
      <div className="notice">{configured
        ? 'Inicie sesión con la cuenta administrativa asignada por su iglesia.'
        : 'Autenticación pendiente de configuración. Configure Microsoft Entra ID en el entorno de la aplicación para habilitar el inicio de sesión.'}</div>
      {authError && <p className="error">{authError}</p>}
      <Button appearance="primary" disabled={!configured} onClick={onSignIn}>Iniciar sesión</Button>
      <p>La información pastoral y financiera requiere permisos específicos.</p>
    </section>
  </main>;
}

function fieldValue(record: ChurchRecord, key: string) {
  const value = record[key];
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'amount') return currency.format(Number(value));
  if (key.endsWith('_on') || key === 'starts_at') return displayDate(value);
  if (typeof value === 'boolean') return value ? 'Activo' : 'Inactivo';
  return String(value);
}

export default function App({ token, userName, authError, onSignIn, onSignOut, onAuthError }: Props) {
  const [section, setSection] = useState<Section>('inicio');
  const [rows, setRows] = useState<ChurchRecord[]>([]);
  const [attendance, setAttendance] = useState<ChurchRecord[]>([]);
  const [members, setMembers] = useState<ChurchRecord[]>([]);
  const [services, setServices] = useState<ChurchRecord[]>([]);
  const [groups, setGroups] = useState<ChurchRecord[]>([]);
  const [memberships, setMemberships] = useState<ChurchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ChurchRecord>();
  const [from, setFrom] = useState(dateToday().slice(0, 7) + '-01');
  const [to, setTo] = useState(dateToday());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChurchRecord>();
  const [saving, setSaving] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState({ service_id: '', member_id: '', status: 'Presente' });
  const module = modules[section];

  const signInConfigured = Boolean(import.meta.env.VITE_ENTRA_CLIENT_ID &&
    import.meta.env.VITE_ENTRA_TENANT_ID && import.meta.env.VITE_ENTRA_API_SCOPE);
  const refresh = useCallback(async () => {
    setError('');
    if (!module || !token) { setRows([]); return; }
    setLoading(true);
    try {
      const result = await api.list(module.endpoint, token);
      setRows(result);
      if (section === 'servicios') {
        const [people, meetings, attendanceRows] = await Promise.all([
          api.list('members', token), Promise.resolve(result), api.list('attendance', token)
        ]);
        setMembers(people);
        setServices(meetings);
        setAttendance(attendanceRows);
      }
      if (section === 'grupos') {
        const [people, membershipRows] = await Promise.all([api.list('members', token), api.list('memberships', token)]);
        setMembers(people);
        setGroups(result);
        setMemberships(membershipRows);
      }
      if (section === 'tesoreria') setMembers(await api.list('members', token));
    } catch (e) {
      const message = e instanceof ApiError && e.status === 401
        ? 'La sesión no está autorizada para consultar este módulo. Confirme los roles asignados.'
        : e instanceof Error ? e.message : 'No se pudo consultar la API.';
      setError(message);
      if (e instanceof ApiError && e.status === 401) onAuthError?.(message);
    } finally { setLoading(false); }
  }, [module, token, section, onAuthError]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (section !== 'inicio' || !token) return;
    setError('');
    setReportLoading(true);
    api.report(from, to, token).then(setReport).catch(e => {
      setReport(undefined);
      setError(e instanceof Error ? e.message : 'No se pudo consultar el reporte.');
    }).finally(() => setReportLoading(false));
  }, [section, token, from, to]);

  const title = sections.find(item => item.id === section)?.label ?? 'Inicio y reportes';
  const latest = useMemo(() => rows.slice(0, 8), [rows]);

  async function submitRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!module || !token) return;
    if (section === 'tesoreria' && !window.confirm('Confirme que los datos del movimiento financiero son correctos antes de guardar.')) return;
    const formData = new FormData(event.currentTarget);
    const record: ChurchRecord = {};
    for (const field of module.fields) {
      const value = formData.get(field.key);
      if (value !== null && value !== '') {
        record[field.key] = field.type === 'number' ? Number(value) : String(value);
      }
    }
    if (section === 'grupos' && record.active) record.active = record.active === 'Activo';
    setSaving(true);
    setError('');
    try {
      if (editing?.id) await api.update(module.endpoint, String(editing.id), record, token);
      else await api.create(module.endpoint, record, token);
      setEditing(undefined);
      setDialogOpen(false);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el registro.'); }
    finally { setSaving(false); }
  }

  async function deleteRecord(id: string) {
    if (!module || !token || !window.confirm('¿Confirma que desea eliminar este registro? Esta acción no se puede deshacer.')) return;
    try { await api.delete(module.endpoint, id, token); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo eliminar el registro.'); }
  }

  async function recordAttendance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !attendanceForm.service_id || !attendanceForm.member_id) return;
    setSaving(true);
    try {
      await api.create('attendance', { ...attendanceForm, attended_on: dateToday() }, token);
      setAttendance(await api.list('attendance', token));
      setAttendanceForm({ service_id: '', member_id: '', status: 'Presente' });
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la asistencia.'); }
    finally { setSaving(false); }
  }

  async function addMembership(groupId: string, memberId: string) {
    if (!token) return;
    try {
      await api.create('memberships', { group_id: groupId, member_id: memberId }, token);
      setMemberships(await api.list('memberships', token));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo asignar el miembro al grupo.'); }
  }

  async function removeMembership(id: string) {
    if (!token || !window.confirm('¿Retirar este miembro del grupo?')) return;
    try { await api.delete('memberships', id, token); setMemberships(await api.list('memberships', token)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo retirar al miembro.'); }
  }

  async function uploadFile(id: string, file?: File) {
    if (!file || !token) return;
    if (file.size > 15 * 1024 * 1024) { setError('El archivo supera el límite de 15 MB.'); return; }
    try {
      await request(`resources/${id}/content`, token, {
        method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file
      });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el archivo.'); }
  }

  async function downloadFile(id: string, fileName: string) {
    if (!token) return;
    try {
      const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:7071/api'}/resources/${id}/content`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('No se pudo descargar el archivo autorizado.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = fileName; link.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descargar el recurso.'); }
  }

  if (!token) return <Login configured={signInConfigured} onSignIn={onSignIn} authError={authError} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">✦</div><div>Diezmos<small>Administración</small></div></div>
      <div className="nav-title">Administración</div>
      <nav className="nav-list" aria-label="Navegación principal">
        {sections.map(item => <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`}
          onClick={() => { setSection(item.id); setError(''); }}>
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
        </button>)}
      </nav>
      <div className="side-note">Acceso privado. No se almacenan datos administrativos en este dispositivo.</div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <span className="topbar-label">Administración · {title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="topbar-label">{userName || 'Personal autorizado'}</span>
          <Button size="small" appearance="subtle" icon={<SignOutRegular />} onClick={onSignOut}>Salir</Button>
        </div>
      </header>
      <main className="main-content">
        <div className="heading">
          <div><div className="eyebrow">Iglesia local · El Salvador</div><h1>{title}</h1>
            <p>{module?.description || 'Resumen consolidado por periodo. Los datos se cargan desde el servidor.'}</p></div>
          {module && <Dialog open={dialogOpen} onOpenChange={(_, data) => { setDialogOpen(data.open); if (!data.open) setEditing(undefined); }}>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="primary" icon={<AddRegular />} onClick={() => { setEditing(undefined); setDialogOpen(true); }}>Nuevo {module.singular}</Button>
            </DialogTrigger>
            <DialogSurface>
              <form onSubmit={submitRecord}>
                <DialogBody>
                  <DialogTitle>Registrar {module.singular}</DialogTitle>
                  <DialogContent>
                    {section === 'pastoral' && <div className="confidential" style={{ marginBottom: 14 }}>Información confidencial: no se incluye en informes generales ni en registros de auditoría.</div>}
                    <div className="form-grid">
                      {module.fields.map(field => <FieldControl key={field.key} field={field} value={editing?.[field.key]} members={members} />)}
                    </div>
                  </DialogContent>
                  <DialogActions>
                    <DialogTrigger disableButtonEnhancement><Button appearance="secondary" type="button" onClick={() => setDialogOpen(false)}>Cancelar</Button></DialogTrigger>
                    <Button appearance="primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
                  </DialogActions>
                </DialogBody>
              </form>
            </DialogSurface>
          </Dialog>}
        </div>
        {error && <div className="notice" role="alert">{error}</div>}
        {section === 'inicio' ? <Dashboard report={report} from={from} to={to} setFrom={setFrom} setTo={setTo} loading={reportLoading} /> :
          module && <section className="surface">
            <div className="surface-head"><div><h2>{module.title}</h2><p>{module.description}</p></div><Button appearance="subtle" onClick={() => void refresh()}>Actualizar</Button></div>
            {section === 'servicios' && <AttendancePanel
              attendance={attendance} members={members} services={services} form={attendanceForm}
              setForm={setAttendanceForm} onSubmit={recordAttendance} saving={saving} />}
            {section === 'grupos' && <MembershipPanel groups={groups} members={members} memberships={memberships}
              onAdd={addMembership} onRemove={removeMembership} />}
            {loading ? <div className="loading-state">Consultando información autorizada…</div> :
              latest.length === 0 ? <div className="empty-state">No hay registros disponibles. Al guardar, la información se persistirá en el servidor.</div> :
              <div className="table-wrap"><table className="record-table"><thead><tr>{module.columns.map(key =>
                <th key={key}>{module.fields.find(field => field.key === key)?.label || key}</th>)}<th>Acciones</th></tr></thead>
                <tbody>{latest.map((record, index) => <tr key={String(record.id || index)}>
                  {module.columns.map(key => <td key={key}>{fieldValue(record, key)}</td>)}
                  <td>
                    <Button size="small" appearance="subtle" icon={<EditRegular />} aria-label={`Editar ${module.singular}`}
                      onClick={() => { setEditing(record); setDialogOpen(true); }} />
                    {section === 'recursos' && record.file_name && <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />}
                      aria-label="Descargar archivo privado" onClick={() => void downloadFile(String(record.id), String(record.file_name))} />}
                    {section === 'recursos' && <Tooltip content="Subir archivo privado (máx. 15 MB)" relationship="label">
                      <label style={{ cursor: 'pointer', marginRight: 8 }}><ArrowUploadRegular />
                        <input type="file" accept="audio/mpeg,audio/mp4,video/mp4,application/pdf,image/jpeg,image/png" hidden onChange={event => void uploadFile(String(record.id), event.target.files?.[0])} />
                      </label>
                    </Tooltip>}
                    <Button size="small" appearance="subtle" icon={<DeleteRegular />} aria-label="Eliminar"
                      onClick={() => void deleteRecord(String(record.id))} />
                  </td>
                </tr>)}</tbody></table></div>}
          </section>}
      </main>
    </div>
  </div>;
}

function FieldControl({ field, value, members = [] }: {
  field: Field; value?: string | number | boolean | null; members?: ChurchRecord[];
}) {
  const formattedValue = field.type === 'datetime-local' && value
    ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(new Date(String(value))).replace(' ', 'T')
    : value == null ? '' : String(value).slice(0, 16);
  return <div className={`form-field ${field.type === 'textarea' || field.private ? 'wide' : ''}`}>
    <label htmlFor={`field-${field.key}`}>{field.label}{field.required ? ' *' : ''}</label>
    {field.dynamic === 'members' ? <Select id={`field-${field.key}`} name={field.key} defaultValue={String(value ?? '')}>
      <option value="">Sin miembro asociado</option>
      {members.map(member => <option key={String(member.id)} value={String(member.id)}>{String(member.full_name)}</option>)}
    </Select> : field.type === 'select' ? <Select id={`field-${field.key}`} name={field.key} required={field.required}
      defaultValue={typeof value === 'boolean' ? (value ? 'Activo' : 'Inactivo') : String(value ?? field.options?.[0] ?? '')}>
      {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
    </Select> : field.type === 'textarea' ? <Textarea id={`field-${field.key}`} name={field.key} required={field.required} maxLength={4000} defaultValue={value == null ? '' : String(value)} /> :
      <Input id={`field-${field.key}`} name={field.key} type={field.type || 'text'} required={field.required}
        min={field.type === 'number' ? 0.01 : undefined} step={field.type === 'number' ? 0.01 : undefined}
        maxLength={field.type === 'text' ? 300 : undefined}
        defaultValue={formattedValue} />}
  </div>;
}

function AttendancePanel({ attendance, members, services, form, setForm, onSubmit, saving }: {
  attendance: ChurchRecord[]; members: ChurchRecord[]; services: ChurchRecord[];
  form: { service_id: string; member_id: string; status: string };
  setForm: (value: { service_id: string; member_id: string; status: string }) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; saving: boolean;
}) {
  return <div style={{ padding: 18, borderBottom: '1px solid #eef0ec' }}>
    <h3 style={{ margin: '0 0 12px', fontSize: 13 }}>Registrar asistencia</h3>
    <form onSubmit={onSubmit} className="form-grid">
      <div className="form-field"><label htmlFor="attendance-service">Servicio</label><select required id="attendance-service" value={form.service_id}
        onChange={e => setForm({ ...form, service_id: e.target.value })}><option value="">Seleccione un servicio</option>
        {services.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.name)} · {displayDate(item.starts_at)}</option>)}</select></div>
      <div className="form-field"><label htmlFor="attendance-member">Miembro</label><select required id="attendance-member" value={form.member_id}
        onChange={e => setForm({ ...form, member_id: e.target.value })}><option value="">Seleccione un miembro</option>
        {members.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.full_name)}</option>)}</select></div>
      <div className="form-field"><label htmlFor="attendance-status">Estado</label><select id="attendance-status" value={form.status}
        onChange={e => setForm({ ...form, status: e.target.value })}><option>Presente</option><option>Ausente</option></select></div>
      <div className="form-field" style={{ alignSelf: 'end' }}><Button appearance="primary" type="submit" disabled={saving}>Guardar asistencia</Button></div>
    </form>
    {attendance.length > 0 && <div className="table-wrap" style={{ marginTop: 14 }}>
      <table className="record-table"><thead><tr><th>Servicio</th><th>Miembro</th><th>Fecha</th><th>Estado</th></tr></thead>
        <tbody>{attendance.slice(0, 8).map((item, index) => <tr key={String(item.id ?? index)}>
          <td>{String(item.service_name ?? '—')}</td><td>{String(item.member_name ?? '—')}</td>
          <td>{displayDate(item.attended_on)}</td><td>{String(item.status ?? '—')}</td>
        </tr>)}</tbody></table>
    </div>}
  </div>;
}

function MembershipPanel({ groups, members, memberships, onAdd, onRemove }: {
  groups: ChurchRecord[]; members: ChurchRecord[]; memberships: ChurchRecord[];
  onAdd: (groupId: string, memberId: string) => void; onRemove: (id: string) => void;
}) {
  const [groupId, setGroupId] = useState('');
  const [memberId, setMemberId] = useState('');
  return <div style={{ padding: 18, borderBottom: '1px solid #eef0ec' }}>
    <h3 style={{ margin: '0 0 12px', fontSize: 13 }}>Integrantes de grupos</h3>
    <div className="form-grid">
      <div className="form-field"><label htmlFor="membership-group">Grupo</label><select id="membership-group" value={groupId}
        onChange={event => setGroupId(event.target.value)}><option value="">Seleccione un grupo</option>
        {groups.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></div>
      <div className="form-field"><label htmlFor="membership-member">Miembro</label><select id="membership-member" value={memberId}
        onChange={event => setMemberId(event.target.value)}><option value="">Seleccione un miembro</option>
        {members.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.full_name)}</option>)}</select></div>
      <div><Button appearance="primary" disabled={!groupId || !memberId} onClick={() => { onAdd(groupId, memberId); setMemberId(''); }}>Asignar al grupo</Button></div>
    </div>
    {memberships.length > 0 && <div className="table-wrap" style={{ marginTop: 14 }}><table className="record-table">
      <thead><tr><th>Grupo</th><th>Miembro</th><th></th></tr></thead>
      <tbody>{memberships.slice(0, 20).map((item, index) => <tr key={String(item.id ?? index)}>
        <td>{String(item.group_name ?? '—')}</td><td>{String(item.member_name ?? '—')}</td>
        <td><Button size="small" appearance="subtle" icon={<DeleteRegular />} aria-label="Retirar del grupo" onClick={() => void onRemove(String(item.id))} /></td>
      </tr>)}</tbody></table></div>}
  </div>;
}

function Dashboard({ report, from, to, setFrom, setTo, loading }: {
  report?: ChurchRecord; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; loading: boolean;
}) {
  const value = (key: string) => report?.[key];
  const formatMoney = (key: string) => value(key) === undefined ? '—' : currency.format(Number(value(key)));
  const tiles: [string, string][] = [
    ['Miembros activos', String(value('active_members') ?? '—')],
    ['Servicios en periodo', String(value('services_count') ?? '—')],
    ['Asistencia registrada', String(value('attendance_count') ?? '—')],
    ['Ingresos (USD)', formatMoney('income_total')],
    ['Egresos (USD)', formatMoney('expense_total')],
    ['Balance (USD)', formatMoney('balance')]
  ];
  return <>
    <section className="surface">
      <div className="surface-head"><div><h2>Resumen administrativo</h2><p>Indicadores agregados; las notas pastorales nunca aparecen aquí.</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11 }}>Desde <input aria-label="Desde" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label style={{ fontSize: 11 }}>Hasta <input aria-label="Hasta" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        </div>
      </div>
      {loading ? <div className="loading-state">Generando reporte desde el servidor…</div> : !report ?
        <div className="empty-state">No hay datos de reporte disponibles o no se pudo conectar con la API. No se muestran registros locales de ejemplo.</div> :
        <div className="cards" style={{ padding: 16, margin: 0 }}>{tiles.map(([label, amount]) =>
          <article className="summary-card" key={String(label)}><span className="summary-label">{label}</span>
            <strong className="summary-value">{String(amount)}</strong></article>)}</div>}
    </section>
    {report && Array.isArray(report.income_by_category) && <section className="surface" style={{ marginTop: 18 }}>
      <div className="surface-head"><div><h2>Ingresos por categoría</h2><p>Agregados del periodo seleccionado.</p></div></div>
      <div className="table-wrap"><table className="record-table"><thead><tr><th>Categoría</th><th>Total</th></tr></thead>
        <tbody>{(report.income_by_category as unknown as { category: string; total: number }[]).map(item =>
          <tr key={item.category}><td>{item.category}</td><td>{currency.format(item.total)}</td></tr>)}</tbody></table></div>
    </section>}
  </>;
}
