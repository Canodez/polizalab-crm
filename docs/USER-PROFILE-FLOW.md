# Flujo de Usuario: Gestión de Sesiones y Perfil

## Diagrama de Flujo General

```
┌─────────────────────────────────────────────────────────────────┐
│                         INICIO DE SESIÓN                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Usuario visita /login │
                    └───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Verificando sesión... │
                    │     (Spinner)         │
                    └───────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │  Sesión ACTIVA      │       │  NO hay sesión      │
    └─────────────────────┘       └─────────────────────┘
                │                               │
                ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │ "Ya tienes sesión"  │       │ Formulario de login │
    │                     │       │ - Email             │
    │ user@email.com      │       │ - Password          │
    │                     │       │ - Botón "Entrar"    │
    │ [Ir a mi perfil]    │       └─────────────────────┘
    │ [Cerrar sesión]     │                   │
    │ [Cambiar cuenta]    │                   ▼
    └─────────────────────┘       ┌─────────────────────┐
                │                 │  Login exitoso      │
                │                 └─────────────────────┘
                │                           │
                └───────────┬───────────────┘
                            ▼
                ┌───────────────────────┐
                │   Redirect a /profile  │
                └───────────────────────┘
```

## Pantalla 1: Login con Sesión Activa

### Estado Visual

```
┌────────────────────────────────────────────────────┐
│                                                    │
│              PolizaLab CRM                         │
│                                                    │
│  ┌──────────────────────────────────────────┐    │
│  │                                          │    │
│  │  ✓  Ya tienes una sesión iniciada       │    │
│  │                                          │    │
│  │  Sesión activa como:                     │    │
│  │  📧 usuario@ejemplo.com                  │    │
│  │                                          │    │
│  │  ┌────────────────────────────────┐     │    │
│  │  │   Ir a mi perfil               │     │    │
│  │  └────────────────────────────────┘     │    │
│  │                                          │    │
│  │  ┌────────────────────────────────┐     │    │
│  │  │   Cerrar sesión                │     │    │
│  │  └────────────────────────────────┘     │    │
│  │                                          │    │
│  │  Cambiar de cuenta                       │    │
│  │                                          │    │
│  └──────────────────────────────────────────┘    │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Interacciones

1. **Botón "Ir a mi perfil"** (Primario - Azul)
   - Acción: `router.push('/profile')`
   - Mantiene sesión activa

2. **Botón "Cerrar sesión"** (Secundario - Gris)
   - Acción: `await logout()` → Muestra formulario de login
   - Limpia tokens de Amplify

3. **Link "Cambiar de cuenta"** (Terciario - Texto)
   - Acción: `await logout()` → Muestra formulario
   - Mismo efecto que "Cerrar sesión" pero con mensaje diferente

## Pantalla 2: Navbar con UserMenu

### Estado Visual (Desktop)

```
┌────────────────────────────────────────────────────────────┐
│  PolizaLab CRM                              [U] ▼          │
└────────────────────────────────────────────────────────────┘
                                                  │
                                                  ▼
                                    ┌─────────────────────────┐
                                    │ usuario@ejemplo.com     │
                                    ├─────────────────────────┤
                                    │ 👤 Mi perfil            │
                                    │ 🔒 Seguridad            │
                                    │ ⚙️  Configuración       │
                                    ├─────────────────────────┤
                                    │ 🚪 Cerrar sesión        │
                                    └─────────────────────────┘
```

### Componentes

1. **Avatar con Iniciales**
   - Círculo con primera letra del email
   - Color de fondo: azul (#3B82F6)
   - Letra blanca, bold

2. **Dropdown Menu**
   - Aparece al hacer click en avatar
   - Animación: fade-in + slide-down (200ms)
   - Cierra al hacer click fuera
   - Keyboard navigation: Tab, Enter, Escape

3. **Opciones del Menú**
   - Mi perfil → `/profile`
   - Seguridad → `/security` (placeholder)
   - Configuración → `/settings` (placeholder)
   - Cerrar sesión → `logout()` + redirect `/login`

## Pantalla 3: Perfil de Usuario (Completo)

### Layout General

```
┌────────────────────────────────────────────────────────────┐
│  ← Volver                                    [U] ▼          │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Mi Perfil                                                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  ┌─────┐                                             │  │
│  │  │     │  Usuario Ejemplo                            │  │
│  │  │  U  │  usuario@ejemplo.com                        │  │
│  │  │     │  [Cambiar foto]                             │  │
│  │  └─────┘                                             │  │
│  │                                                       │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  📋 Información Personal                             │  │
│  ├─────────────────────────────────────────────────────┤  │
│  │  Nombre completo                                     │  │
│  │  [________________]                                  │  │
│  │                                                       │  │
│  │  Email                                               │  │
│  │  usuario@ejemplo.com (verificado ✓)                 │  │
│  │                                                       │  │
│  │  Teléfono                                            │  │
│  │  [________________]                                  │  │
│  │                                                       │  │
│  │  Empresa                                             │  │
│  │  [________________]                                  │  │
│  │                                                       │  │
│  │  [Guardar cambios]                                   │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  🔐 Información de Cuenta                            │  │
│  ├─────────────────────────────────────────────────────┤  │
│  │  Email verificado: ✓ Sí                             │  │
│  │  Fecha de registro: 15 Feb 2026                     │  │
│  │  Último acceso: Hace 5 minutos                      │  │
│  │  ID de usuario: ••••••••  [Mostrar]                 │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  ⚙️  Preferencias                                    │  │
│  ├─────────────────────────────────────────────────────┤  │
│  │  Idioma: Español                                     │  │
│  │  Zona horaria: America/Mexico_City (Auto)           │  │
│  │  Notificaciones por email: [ON] OFF                 │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### Secciones Detalladas

#### 1. Header con Foto de Perfil

**Elementos:**
- Avatar grande (120px x 120px)
- Nombre del usuario (extraído del perfil o email)
- Email (solo lectura, viene de Cognito)
- Botón "Cambiar foto"

**Flujo de Cambio de Foto:**
```
1. Usuario click "Cambiar foto"
2. Abrir file picker (accept: image/jpeg, image/png)
3. Validar tamaño (max 2MB)
4. Mostrar preview
5. Botón "Guardar" → Request pre-signed URL a Lambda
6. Upload a S3 con pre-signed URL
7. Actualizar URL en DynamoDB
8. Mostrar nueva foto
```

#### 2. Información Personal (Editable)

**Campos:**
- Nombre completo (text input)
- Email (readonly, badge "verificado")
- Teléfono (text input con validación)
- Empresa (text input)

**Validaciones:**
- Nombre: mínimo 2 caracteres
- Teléfono: formato internacional opcional
- Empresa: opcional

**Botón "Guardar cambios":**
- Disabled si no hay cambios
- Loading state mientras guarda
- Toast de éxito/error

#### 3. Información de Cuenta (Solo Lectura)

**Datos mostrados:**
- Email verificado: ✓ o ✗ (badge verde/rojo)
- Fecha de registro: formato "15 Feb 2026"
- Último acceso: formato relativo "Hace 5 minutos"
- ID de usuario: oculto por defecto (••••••••), botón "Mostrar" para revelar

**Propósito:**
- Transparencia para el usuario
- Útil para soporte técnico
- Verificación de seguridad

#### 4. Preferencias

**Opciones:**
- **Idioma:** Dropdown (por ahora solo Español)
- **Zona horaria:** Auto-detectada, editable
- **Notificaciones:** Toggle on/off

**Futuras preferencias:**
- Tema: Claro/Oscuro
- Formato de fecha: DD/MM/YYYY vs MM/DD/YYYY
- Moneda preferida

#### 5. Sesiones Activas (Futura - Fase 2)

**Información por sesión:**
- Dispositivo/Navegador: "Chrome en Windows"
- Ubicación aproximada: "Ciudad de México, México"
- IP: "192.168.1.1"
- Última actividad: "Hace 5 minutos"
- Estado: "Sesión actual" o "Activa"

**Acciones:**
- Botón "Cerrar esta sesión" (para otras sesiones)
- Botón "Cerrar todas excepto esta"

## Pantalla 4: Sesión Expirada

### Estado Visual

```
┌────────────────────────────────────────────────────┐
│                                                    │
│              PolizaLab CRM                         │
│                                                    │
│  ┌──────────────────────────────────────────┐    │
│  │                                          │    │
│  │  ⚠️  Tu sesión ha expirado               │    │
│  │                                          │    │
│  │  Por seguridad, necesitas iniciar        │    │
│  │  sesión nuevamente.                      │    │
│  │                                          │    │
│  │  ┌────────────────────────────────┐     │    │
│  │  │   Iniciar sesión               │     │    │
│  │  └────────────────────────────────┘     │    │
│  │                                          │    │
│  └──────────────────────────────────────────┘    │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Trigger

- Token refresh falla en `AuthProvider`
- API call retorna 401
- Usuario intenta acceder a ruta protegida sin sesión válida

### Comportamiento

1. Detectar sesión expirada
2. Hacer `signOut()` automático (limpiar tokens)
3. Redirect a `/login?expired=true`
4. Mostrar mensaje de sesión expirada
5. Después de login exitoso, redirect a página original (si aplica)

## Flujos de Navegación Completos

### Flujo 1: Usuario Nuevo

```
1. Visita / (home)
2. Click "Registrarse"
3. /register → Completa formulario
4. Registro exitoso → Redirect /login?registered=true
5. Mensaje "Cuenta creada, inicia sesión"
6. Login exitoso → Redirect /profile
7. Completa información de perfil
8. Navega por la app
```

### Flujo 2: Usuario Existente (Login Normal)

```
1. Visita /login
2. Verifica sesión (no hay)
3. Muestra formulario
4. Ingresa credenciales
5. Login exitoso → Redirect /profile
6. Ve su información
```

### Flujo 3: Usuario con Sesión Activa

```
1. Visita /login (por error o bookmark)
2. Verifica sesión (hay sesión)
3. Muestra "Ya tienes sesión"
4. Click "Ir a mi perfil"
5. Redirect /profile
```

### Flujo 4: Cambio de Cuenta

```
1. Usuario A está logueado
2. Quiere cambiar a Usuario B
3. Click avatar → "Cerrar sesión"
4. Redirect /login
5. Ingresa credenciales de Usuario B
6. Login exitoso → Redirect /profile
7. Ve información de Usuario B
```

### Flujo 5: Sesión Expirada Durante Uso

```
1. Usuario navegando en /profile
2. Token expira (después de 1 hora)
3. Intenta guardar cambios
4. API retorna 401
5. AuthProvider detecta error
6. Muestra toast "Sesión expirada"
7. Redirect /login?expired=true&redirect=/profile
8. Usuario hace login
9. Redirect de vuelta a /profile
```

## Consideraciones de UX

### 1. Feedback Visual

- **Loading states:** Spinners en botones durante operaciones
- **Success states:** Toast verde con ✓
- **Error states:** Toast rojo con mensaje claro
- **Disabled states:** Botones grises cuando no aplicable

### 2. Animaciones

- Transiciones suaves (200-300ms)
- Fade-in para modals y dropdowns
- Slide-down para mensajes de error/éxito
- Skeleton loaders para carga de datos

### 3. Responsive Design

**Desktop (>768px):**
- Navbar horizontal con UserMenu en esquina
- Perfil en 2 columnas (sidebar + contenido)
- Dropdowns con hover

**Mobile (<768px):**
- Navbar con menú hamburguesa
- Perfil en 1 columna (stack vertical)
- Dropdowns con tap
- Botones full-width

### 4. Accesibilidad

- Todos los botones con aria-labels
- Keyboard navigation en dropdowns
- Focus visible en todos los elementos interactivos
- Contraste de colores WCAG AA
- Screen reader friendly

### 5. Performance

- Lazy load de componentes pesados (ej: image uploader)
- Optimistic UI updates (actualizar UI antes de confirmar con servidor)
- Debounce en inputs de búsqueda/filtros
- Cache de datos de perfil en memoria

## Métricas de Éxito

1. **Reducción de errores de sesión:** <1% de usuarios reportan "already signed in"
2. **Tiempo de navegación:** Usuario llega a perfil en <3 clicks
3. **Tasa de abandono:** <5% en flujo de login
4. **Satisfacción:** >4.5/5 en encuesta de UX

## Próximos Pasos

1. Implementar detección de sesión en `/login`
2. Crear componente `UserMenu`
3. Mejorar página `/profile` con nuevas secciones
4. Agregar upload de foto de perfil
5. Implementar manejo de sesión expirada
6. Testing exhaustivo de todos los flujos
7. Deploy a producción
8. Monitorear métricas y feedback de usuarios
