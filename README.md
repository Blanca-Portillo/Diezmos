# Diezmos — Administración de iglesia local

Portal privado en español para administración de iglesia de las Asambleas de Dios en El Salvador. La SPA React/TypeScript utiliza Fluent UI v9; Azure Functions aisladas en C# valida tokens de Microsoft Entra ID y permisos por módulo; PostgreSQL conserva los registros y un contenedor Blob privado almacena recursos. La zona horaria es `America/El_Salvador`; informes financieros se expresan en USD.

El `index.html` original se conserva sin cambios en [`reference/prototype.html`](reference/prototype.html) como guía visual/funcional. No se lee ni importa su `localStorage`; no se muestran datos de demostración.

## Desarrollo local

Requisitos: Node.js 20+, .NET 10 SDK, Azure Functions Core Tools v4, PostgreSQL 14+ y Azurite (o Azure Storage). Copie `services/api/local.settings.json.example` a `services/api/local.settings.json` y configure valores locales; no agregue ese archivo al control de versiones. Cree una base vacía y aplique la migración:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f services/api/migrations/001_initial_schema.sql
```

Configure `.env.local` desde `.env.example` con `VITE_API_BASE_URL`, el client ID de la SPA, tenant ID y `VITE_ENTRA_API_SCOPE` (por ejemplo, `api://<api-client-id>/access_as_user`). Registre una SPA de Entra ID y una API protegida con scope delegado `access_as_user`; asigne roles de aplicación `Admin`, `Treasury` y/o `Pastoral` según privilegio mínimo. El API `ENTRA_API_AUDIENCE` debe coincidir con `aud` del access token (`api://<api-client-id>`). `staticwebapp.config.json` contiene fallback de SPA y encabezados básicos; configure el dominio y políticas de despliegue durante el release.

Terminal 1 (desde la raíz):

```powershell
Set-Location services/api
func start
```

Terminal 2 (desde la raíz; Vite imprime la URL `localhost`):

```powershell
npm.cmd install
npm.cmd run dev
```

La API local usa `http://localhost:7071/api/health`. Para que la SPA pueda llamar a la API, configure `CORS_ALLOWED_ORIGIN=http://localhost:5173` en el entorno de Functions. En Azure, limite CORS al dominio exacto de Static Web Apps y use HTTPS.

## API autenticada

Todas las rutas salvo `GET /api/health` requieren `Authorization: Bearer <Entra access token>`. Los permisos se verifican en el servidor: `Admin` para miembros, grupos, servicios, asistencia, recursos y reportes administrativos; `Treasury` para movimientos y campos financieros agregados; `Pastoral` para seguimientos confidenciales.

| Método | Ruta | Permiso |
|---|---|---|
| GET, POST | `/api/members` | Admin |
| PUT, DELETE | `/api/members/{id}` | Admin |
| GET, POST | `/api/groups` | Admin |
| PUT, DELETE | `/api/groups/{id}` | Admin |
| GET, POST | `/api/memberships` | Admin |
| PUT, DELETE | `/api/memberships/{id}` | Admin |
| GET, POST | `/api/services` | Admin |
| PUT, DELETE | `/api/services/{id}` | Admin |
| GET, POST | `/api/attendance` | Admin |
| PUT, DELETE | `/api/attendance/{id}` | Admin |
| GET, POST | `/api/resources` | Admin |
| PUT, DELETE | `/api/resources/{id}` | Admin |
| GET, PUT | `/api/resources/{id}/content` | Admin |
| GET, POST | `/api/treasury` | Treasury |
| PUT, DELETE | `/api/treasury/{id}` | Treasury |
| GET, POST | `/api/pastoral` | Pastoral |
| PUT, DELETE | `/api/pastoral/{id}` | Pastoral |
| GET | `/api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | Admin; totales financieros solo con Treasury |

`OPTIONS` preflight debe habilitarse mediante CORS de Functions o la configuración del host. Las notas pastorales no se incluyen en informes. Los eventos de auditoría guardan actor, operación y entidad, nunca notas sensibles ni montos.

## PostgreSQL

La migración inicial es `services/api/migrations/001_initial_schema.sql`. Aplíquela mediante el proceso de despliegue aprobado; el arranque de la Function no ejecuta cambios de esquema automáticamente. No incluye seed/demo data. Los archivos aceptados son MP3, M4A, MP4, PDF, JPEG y PNG hasta 15 MB; el servidor crea nombres de blob opacos y el contenedor nunca es público. Confirme restricciones y análisis antimalware de archivos antes de producción. Proteja copias de seguridad y datos personales, y defina retención/eliminación y responsables antes de producción.

## Operación en Azure

Configure Azure Functions .NET 10 isolated (en Linux use un plan Flex Consumption u otro plan compatible), PostgreSQL Flexible Server, cuenta de Storage con contenedor privado `church-resources`, Static Web Apps, Application Insights, respaldo/retención y secretos de conexión mediante Key Vault/identidad administrada donde aplique. La identidad, roles, CORS, origen, red y valores de secretos deben configurarse por ambiente; ninguna contraseña o credencial se incluye en el repositorio. Antes de habilitar datos reales, revisar el modelo de roles con los responsables y confirmar política de retención, tamaño/tipos de archivo y recuperación.

Esta estructura es un scaffold local; no ha provisionado recursos Azure ni reemplaza revisión humana, pruebas de seguridad o validación de configuración productiva.
