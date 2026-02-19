# Prompt para Google Gemini: Sistema de Gestión de Sesiones y Perfil de Usuario

## Contexto del Proyecto

Estoy desarrollando un CRM (PolizaLab) con Next.js 15, TypeScript, Tailwind CSS y AWS Amplify (Cognito) para autenticación. Actualmente tengo un problema: cuando un usuario ya tiene una sesión activa e intenta hacer login nuevamente, recibe el error "There is already a signed in user."

## Problema Actual

1. La página `/login` no detecta si ya hay una sesión activa
2. No hay botón de "Cerrar sesión" visible en la aplicación
3. El usuario no puede cambiar de cuenta fácilmente
4. La experiencia de usuario es confusa cuando hay sesión activa

## Solución Requerida

### 1. Página de Login Inteligente (`/login`)

**Comportamiento esperado:**

**Estado 1: Verificando sesión (inicial)**
- Mostrar spinner con texto "Verificando sesión..."
- Duración: 500ms-1s máximo

**Estado 2: Ya hay sesión activa**
- Mensaje principal: "Ya tienes una sesión iniciada"
- Mostrar email del usuario actual
- Botones:
  - **"Ir a mi perfil"** (botón primario azul, redirige a `/profile`)
  - **"Cerrar sesión"** (botón secundario gris, hace signOut y muestra formulario)
  - **"Cambiar de cuenta"** (botón terciario, hace signOut + muestra formulario)

**Estado 3: No hay sesión**
- Mostrar formulario de login normal (ya existe)

**Estado 4: Sesión expirada/inválida**
- Mensaje: "Tu sesión expiró. Por favor, inicia sesión nuevamente."
- Botón "Reiniciar sesión" que hace signOut + muestra formulario
- Color de alerta: amarillo/naranja (warning)

### 2. Navbar con Menú de Usuario

Crear un componente `<UserMenu />` que se muestre en todas las páginas cuando `isAuthenticated === true`.

**Ubicación:** Esquina superior derecha

**Elementos visuales:**
- Avatar circular con iniciales del usuario (primera letra del email)
- Al hacer click, mostrar dropdown con:
  - Email del usuario (texto gris, no clickeable)
  - Separador
  - "Mi perfil" → `/profile`
  - "Seguridad" → `/security` (futura)
  - "Configuración" → `/settings` (futura)
  - Separador
  - "Cerrar sesión" (texto rojo) → ejecuta `logout()`

**Diseño:**
- Usar Heroicons para iconos
- Dropdown con sombra y animación suave
- Responsive: en móvil, mostrar menú hamburguesa

### 3. Página de Perfil Mejorada (`/profile`)

**Secciones a implementar:**

#### Sección 1: Información Personal (ya existe, mejorar)
- Nombre completo
- Email (solo lectura, viene de Cognito)
- Teléfono
- Empresa
- Botón "Guardar cambios"

#### Sección 2: Foto de Perfil (nueva)
- Avatar circular grande (120px)
- Botón "Cambiar foto"
- Subir imagen a S3 con pre-signed URL
- Mostrar preview antes de guardar
- Validación: solo JPG/PNG, máximo 2MB

#### Sección 3: Información de Cuenta (nueva, solo lectura)
- Email verificado: ✓ o ✗
- Fecha de registro
- Último inicio de sesión
- ID de usuario (Cognito sub, oculto por defecto, botón "Mostrar")

#### Sección 4: Preferencias (nueva)
- Idioma: Español (por ahora solo uno)
- Zona horaria: Auto-detectar
- Notificaciones por email: toggle on/off

#### Sección 5: Sesiones Activas (futura, opcional)
- Lista de dispositivos/navegadores con sesión activa
- Botón "Cerrar todas las sesiones excepto esta"

### 4. Flujo de Navegación Completo

```
Usuario no autenticado:
/ (home) → Botón "Iniciar sesión" → /login → Login exitoso → /profile

Usuario autenticado:
/ (home) → Navbar con UserMenu → Click "Mi perfil" → /profile
/login → Detecta sesión → Muestra "Ya tienes sesión" → Botón "Ir a perfil" → /profile

Usuario con sesión expirada:
/profile → Token inválido → Redirect a /login?expired=true → Mensaje "Sesión expirada"
```

### 5. Manejo de Errores y Edge Cases

**Caso 1: Token expirado durante navegación**
- Detectar error 401 en API calls
- Mostrar toast: "Tu sesión expiró"
- Redirect automático a `/login?expired=true`

**Caso 2: Sesión corrupta (tokens inválidos)**
- Detectar en `AuthProvider.loadUser()`
- Hacer `signOut()` automático
- Mostrar mensaje: "Detectamos un problema con tu sesión. Por favor, inicia sesión nuevamente."

**Caso 3: Múltiples tabs abiertos**
- Usar `Hub.listen('auth')` para sincronizar estado entre tabs
- Si usuario cierra sesión en un tab, cerrar en todos

**Caso 4: Refresh de página en ruta protegida**
- Mostrar skeleton/loading mientras verifica sesión
- Si no hay sesión, redirect a `/login?redirect=/profile`

## Especificaciones Técnicas

### Componentes a Crear/Modificar

1. **`app/login/page.tsx`** (modificar)
   - Agregar hook `useAuth()` para detectar sesión
   - Agregar estados: checking, hasSession, noSession, expired
   - Agregar lógica de redirect

2. **`components/UserMenu.tsx`** (nuevo)
   - Dropdown con Headless UI o Radix UI
   - Avatar con iniciales
   - Menú con opciones

3. **`components/Navbar.tsx`** (nuevo)
   - Barra superior con logo y UserMenu
   - Responsive

4. **`app/profile/page.tsx`** (modificar)
   - Agregar nuevas secciones
   - Mejorar UI con tabs o accordion

5. **`lib/auth-context.tsx`** (modificar)
   - Agregar manejo de sesión expirada
   - Agregar método `checkSession()` público

### Librerías Recomendadas

- **Headless UI** o **Radix UI**: Para dropdown del UserMenu
- **React Hot Toast**: Para notificaciones
- **date-fns**: Para formatear fechas
- **react-dropzone**: Para subir foto de perfil

### Estilos y UX

- Usar Heroicons para todos los iconos
- Colores:
  - Primario: Azul (#3B82F6)
  - Secundario: Gris (#6B7280)
  - Éxito: Verde (#10B981)
  - Error: Rojo (#EF4444)
  - Warning: Amarillo (#F59E0B)
- Animaciones suaves (transition-all duration-200)
- Sombras sutiles para cards y dropdowns
- Responsive: mobile-first

## Preguntas para Gemini

1. ¿Cómo implementarías la detección de sesión en `/login` sin causar flickering?
2. ¿Cuál es la mejor forma de sincronizar estado de auth entre múltiples tabs?
3. ¿Cómo manejarías el upload de foto de perfil con S3 pre-signed URLs?
4. ¿Qué patrón recomendarías para el UserMenu dropdown (Headless UI vs Radix UI vs custom)?
5. ¿Cómo estructurarías la página de perfil para que sea escalable (tabs, accordion, o secciones)?
6. ¿Qué estrategia usarías para detectar y manejar tokens expirados en API calls?

## Entregables Esperados

1. Código completo de todos los componentes mencionados
2. Explicación de decisiones de diseño
3. Manejo de edge cases y errores
4. Tests unitarios para componentes críticos (opcional pero recomendado)
5. Documentación de flujos de usuario

## Restricciones

- No usar emojis en el código (usar Heroicons)
- Seguir conventional commits
- TypeScript estricto (no usar `any`)
- Accesibilidad: aria-labels, keyboard navigation
- Performance: lazy loading de componentes pesados

---

**Nota:** Este es un proyecto real en producción. El código debe ser production-ready, no solo un ejemplo.
