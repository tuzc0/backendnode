# Pruebas de Seguridad — VS Code REST Client

Pruebas manuales para evidenciar los controles de seguridad del backend Node.js.
Diseñadas para **VS Code REST Client** (extensión `humao.rest-client`).

---

## Estructura

```
restclient/security-tests/
├── 00-health.http          ← Disponibilidad y health check
├── 01-auth-jwt.http        ← Autenticación JWT y tiempo restante
├── 02-authorization.http   ← Autorización por roles (RBAC)
├── 03-validation.http      ← Validación de entradas y rechazo de datos inválidos
├── 04-crud-basic.http      ← CRUD completo de recursos principales
├── 05-files.http           ← Gestión de archivos (upload, validación, eliminación)
├── 06-error-resilience.http← Resiliencia: errores controlados y servidor activo
├── files/
│   ├── valid-image.jpg     ← DEBES PROVEER ESTE ARCHIVO (ver abajo)
│   └── invalid-file.txt    ← Archivo de texto para pruebas de rechazo
├── security-tests.env.example  ← Plantilla de variables (segura para GitHub)
├── security-tests.env          ← TU archivo local con credenciales (NO SUBIR)
└── README.md               ← Este archivo
```

---

## Requisitos previos

### 1. Instalar VS Code REST Client
Busca e instala la extensión `humao.rest-client` en VS Code.

### 2. Tener el backend corriendo
```bash
npm start
```
Verifica con: `GET http://localhost:3000/health`

### 3. Configurar credenciales locales

**Paso 1:** Las variables están definidas al inicio de cada `.http` con valores ficticios:
```
@adminEmail    = admin@example.com
@adminPassword = Admin123
```

**Paso 2:** Edita las variables al inicio de cada archivo según los usuarios que existan en tu base de datos de desarrollo. No uses credenciales de producción.

**Referencia opcional:** Copia `security-tests.env.example` → `security-tests.env` y documenta allí los valores reales. Ese archivo no se sube a GitHub.

> **IMPORTANTE:** `security-tests.env` está en `.gitignore`. Nunca lo subas al repositorio. Los archivos `.http` tampoco se suben por la regla `restclient/` en `.gitignore`.

### 4. Proveer imagen JPG para pruebas de archivos
El archivo `files/valid-image.jpg` no se incluye en el repositorio (puede ser cualquier JPG pequeño, máx 2 MB). Copia cualquier imagen `.jpg` a esa ruta antes de ejecutar `05-files.http`. No uses fotos personales ni sensibles.

---

## Cómo ejecutar

1. Abre cualquier archivo `.http` en VS Code.
2. Haz clic en **"Send Request"** sobre cada request (`### ...`).
3. La respuesta aparece en el panel derecho.
4. Los requests nombrados con `# @name loginAdmin` deben ejecutarse **antes** de los que usan `{{loginAdmin.response.body.$.jwt}}`.

### Orden recomendado para evidencia completa

```
00-health.http       → confirmar que el servidor levantó
01-auth-jwt.http     → probar login y tiempo de token
02-authorization.http → probar roles y acceso denegado
03-validation.http   → probar rechazo de datos inválidos
04-crud-basic.http   → probar operaciones completas CRUD
05-files.http        → probar gestión de archivos
06-error-resilience.http → probar que el servidor no se cae
```

---

## Qué evidencia capturar para la entrega

| Evidencia | Archivo | Requests clave |
|---|---|---|
| Health check / servidor activo | `00-health.http` | `/health`, `/health/db` |
| Login correcto + JWT | `01-auth-jwt.http` | login correcto → 200 + jwt |
| Login fallido sin revelar datos | `01-auth-jwt.http` | contraseña incorrecta → 401 genérico |
| Token expirado / inválido | `01-auth-jwt.http` | tokens inválidos → 401 |
| Acceso con rol correcto | `02-authorization.http` | Admin → 200, Usuario en /categorias → 200 |
| Acceso denegado por rol | `02-authorization.http` | Usuario en /usuarios → 403 |
| Sin token → 401 | `02-authorization.http` | sin header → 401 |
| Validación XSS rechazada | `03-validation.http` | `<script>` en nombre → 400 |
| Campos prohibidos rechazados | `03-validation.http` | `id`, `passwordhash`, `rolid` → 400 |
| Password débil rechazada | `03-validation.http` | sin mayúscula / sin número → 400 |
| CRUD completo | `04-crud-basic.http` | crear → consultar → editar → eliminar |
| Archivo JPG aceptado | `05-files.http` | upload .jpg → 201 |
| Archivo no-JPG rechazado | `05-files.http` | upload .txt → 400 |
| Firma JPEG inválida rechazada | `05-files.http` | .txt renombrado a .jpg → 400 |
| Ruta inexistente → 404 | `06-error-resilience.http` | `/api/recurso-X` → 404 |
| Método no permitido → 405 | `06-error-resilience.http` | GET `/api/auth` → 405 |
| Servidor activo post-error | `06-error-resilience.http` | `/health` después de cada error → 200 |

---

## Relación con criterios del proyecto

| Criterio | Archivos |
|---|---|
| Validación API sin cliente | `03-validation.http` |
| Autenticación JWT | `01-auth-jwt.http` |
| Autorización por roles | `02-authorization.http` |
| Secciones privadas | `02-authorization.http`, `04-crud-basic.http` |
| Validación de entradas | `03-validation.http` |
| API no se cae ante errores | `06-error-resilience.http` |
| Gestión de archivos | `05-files.http` |
| Health check | `00-health.http` |
| Bitácora | `04-crud-basic.http` (sección Bitácora) |

---

## Notas de seguridad

- Ningún archivo en esta carpeta contiene credenciales reales.
- Los valores `admin@example.com` / `Admin123` son ficticios y deben cambiarse localmente.
- Todo el contenido de `restclient/` está excluido de git por `.gitignore`.
- No uses este proyecto contra servidores de producción.
