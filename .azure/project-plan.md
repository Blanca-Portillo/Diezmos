# Diezmos — Administración de iglesia local

**Status**: Approved
**Created**: 2026-11-23
**Mode**: Interactive

## 1. Project Overview

Planificar una aplicación web administrativa y de tesorería para una iglesia local de las Asambleas de Dios en El Salvador. La aplicación centralizará la operación de la iglesia en español y estará disponible únicamente para el personal administrativo autorizado.

- **Tipo de aplicación**: SPA + API.
- **Audiencia**: Administración local.
- **Idioma y configuración regional**: Español; fechas y zona horaria `America/El_Salvador`; moneda de reportes financieros USD.
- **Modelo de organización**: Una iglesia local, sin administración de múltiples congregaciones o inquilinos.
- **Autenticación**: Requerida para acceder a las funciones de la API.

## 2. Goals & Scope

### Goals

- Mantener horarios de servicios, actividades y recursos de predicaciones en un solo lugar.
- Administrar miembros y su participación en grupos.
- Registrar diezmos, ofrendas y otros movimientos de tesorería con trazabilidad.
- Dar seguimiento pastoral con acceso restringido.
- Producir reportes administrativos y financieros por periodo.

### In scope

- Portal privado para administración: miembros, grupos, servicios, recursos, seguimiento pastoral, tesorería e informes.
- Registro y consulta de ingresos y egresos; los registros deben distinguir diezmos, ofrendas y otras categorías configurables.
- Informes agregados por periodo y categoría, con filtros apropiados para la función del usuario.
- Carga y consulta de archivos de predicaciones y recursos.
- Adaptación del prototipo existente `index.html` como referencia funcional inicial: ya muestra registro de personas, asistencia y movimientos financieros en el navegador. El estado local del prototipo no debe considerarse almacenamiento persistente ni migrarse automáticamente.

### Out of scope

- Gestión de varias iglesias, sedes, distritos o tenants.
- Portal público o acceso para miembros y donantes.
- Procesamiento de pagos, conexión bancaria, contabilidad fiscal o emisión de comprobantes fiscales.
- Mensajería masiva, aplicaciones móviles y migración automática de datos del prototipo.

## 3. Requirements Summary

- **Prioridades**: servicios y horarios; miembros y grupos; predicaciones y recursos; donaciones o diezmos; seguimiento pastoral; reportes.
- **Usuarios**: personal administrativo de la iglesia; el uso requiere inicio de sesión.
- **Idioma de interfaz**: Español.
- **Cumplimiento**: no se indicaron requisitos especiales. Aun así, los datos personales, las donaciones y las notas pastorales requieren controles de privacidad y acceso.
- **Supuestos funcionales**: los aportes se registran como movimientos administrativos internos, no como pagos en línea. Los recursos multimedia/documentales pueden almacenarse como archivos.

## 4. Architecture & Services

| Service | Type | Planned technology | Responsibility |
|---|---|---|---|
| Portal web | Frontend | React, TypeScript, Fluent UI v9 | Interfaz privada, adaptable y en español para tareas administrativas. |
| API de administración | Backend | Azure Functions con C# (.NET) | Autenticación/autorización de operaciones, validación, reglas de negocio, consultas e informes. |

La SPA consumirá la API mediante HTTPS. Las operaciones de escritura y lectura se realizarán en el servidor; el navegador no será la fuente de verdad de miembros, registros financieros o notas pastorales. Los informes serán consultas agregadas del lado de la API y limitarán los datos según permisos.

## 5. Data & Storage

| Store | Planned use |
|---|---|
| PostgreSQL | Datos relacionales de la iglesia, miembros, grupos, actividades, asistencia, movimientos de tesorería, seguimientos pastorales y metadatos de recursos. |
| Blob Storage | Archivos de predicaciones y recursos, además del almacenamiento asociado requerido por Azure Functions (`AzureWebJobsStorage`). |

Entidades iniciales a modelar:

- **Perfil de iglesia**: datos de configuración de la única iglesia administrada.
- **Usuario y rol administrativo**: identidad y permisos de acceso.
- **Miembro y grupo**: información básica de membresía y relación con grupos.
- **Servicio/actividad y asistencia**: horarios, eventos y registros de asistencia.
- **Predicación/recurso**: metadatos, fecha, descripción y referencia segura al archivo almacenado.
- **Movimiento de tesorería**: fecha, tipo (ingreso/egreso), categoría, monto en USD, descripción y, cuando corresponda, miembro asociado.
- **Seguimiento pastoral**: fecha, responsable, estado y notas de acceso especialmente restringido.
- **Registro de auditoría**: usuario, operación, entidad y momento para cambios relevantes, especialmente tesorería y datos pastorales.

Aplicar migraciones de esquema revisables. No incluir datos de ejemplo ni datos personales reales en el plan o en futuras migraciones. Las notas pastorales no deben aparecer en informes generales; los informes financieros deben presentar agregados salvo que un usuario autorizado necesite detalle.

## 6. Design System & UI

**Component Library**: Fluent UI v9

- **Framework**: React con TypeScript.
- **Idioma y formato**: interfaz en español, fechas locales de El Salvador y montos mostrados en USD.
- **Estructura**: navegación administrativa con secciones separadas para Inicio/Reportes, Servicios, Miembros y grupos, Predicaciones y recursos, Tesorería y Seguimiento pastoral.
- **Diseño**: responsive y accesible, con tablas legibles, filtros por periodo, formularios con validación y confirmación de acciones financieras sensibles.
- **Privacidad visible**: separar los datos pastorales de la navegación y reportes generales; mostrar claramente cuándo una vista contiene información restringida.
- **Referencia existente**: `index.html` aporta una base visual/funcional de asistencia y finanzas, pero la interfaz final debe migrar a componentes de Fluent UI y a datos servidos por la API.

## 7. Security & Privacy

- Requerir autenticación para todas las rutas administrativas y validar autorización en la API, no solo en la interfaz.
- Aplicar privilegio mínimo y separar permisos para administración general, tesorería e información pastoral; definir roles concretos durante la implementación.
- Proteger secretos mediante configuración segura del entorno de Azure; usar HTTPS y cifrado administrado en tránsito y en reposo.
- Restringir el acceso a archivos de Blob Storage; no exponer contenedores públicos ni credenciales de almacenamiento al navegador.
- Registrar auditoría para cambios financieros y accesos/cambios relevantes, sin copiar notas pastorales ni secretos en logs.
- Minimizar datos personales y documentar reglas de acceso, retención y eliminación antes de producción.
- No se ha seleccionado proveedor de identidad ni se han definido requisitos regulatorios adicionales; confirmar esas decisiones antes de producción.

## 8. API & Integrations

La API HTTP de Azure Functions expondrá operaciones autenticadas para:

- Miembros, grupos, servicios, horarios y asistencia.
- Metadatos de predicaciones y recursos, con acceso controlado a archivos de Blob Storage.
- Registro y consulta de movimientos de tesorería.
- Seguimientos pastorales con autorización específica.
- Reportes de membresía, actividad y finanzas con filtros por periodo.

Validar entradas, permisos, rangos de fechas y montos en el servidor. No se planifican integraciones de pago, bancarias ni de mensajería en esta fase.

## 9. Azure Hosting & Operations

- Hospedar el frontend como aplicación web estática de Azure.
- Ejecutar la API en Azure Functions con C# (.NET); configurar su cuenta de almacenamiento asociada.
- Usar Azure Database for PostgreSQL para persistencia relacional y Azure Blob Storage para archivos.
- Separar configuración y recursos por ambiente; aplicar copias de seguridad y monitoreo antes de habilitar uso productivo.
- Seleccionar región, SKU, red, cuotas y estimación de costos durante la fase de despliegue, de acuerdo con disponibilidad y presupuesto aprobados.

## 10. Assumptions & Decisions Needed

- La aplicación cubre una iglesia local y solo la usa su administración; no existe necesidad actual de acceso de miembros.
- El registro de diezmos/donaciones es contable-administrativo y no procesa transacciones.
- Los horarios, recursos y reportes son administrados internamente; cualquier publicación pública futura requiere una decisión de alcance y permisos separada.
- Confirmar el esquema de roles y quién puede consultar notas pastorales y detalle financiero.
- Confirmar el proveedor de identidad, las reglas de retención de datos y los tipos/tamaños de archivos permitidos antes de producción.
- Validar que el presupuesto y la región disponibles permiten los servicios administrados propuestos.
