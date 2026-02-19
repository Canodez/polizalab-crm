# Lista de Tareas: Sistema de Gestión de Sesiones y Perfil de Usuario

## Resumen

Implementar un sistema completo de gestión de sesiones que resuelva el error "There is already a signed in user" y mejore la experiencia del usuario con un perfil más completo y funcional.

## Fase 1: Gestión de Sesiones (CRÍTICO)

### 1. Login Inteligente con Detección de Sesión

- [x] 1.1 Modificar página de login para detectar sesión activa
  - [x] 1.1.1 Agregar hook `useAuth()` en LoginPage
  - [x] 1.1.2 Implementar estado de carga "Verificando sesión..."
  - [x] 1.1.3 Crear componente `LoadingSpinner` reutilizable
  - [x] 1.1.4 Agregar lógica condicional basada en `isAuthenticated`

- [x] 1.2 Crear componente `AlreadyLoggedInView`
  - [x] 1.2.1 Diseñar UI con mensaje "Ya tienes sesión iniciada"
  - [x] 1.2.2 Mostrar email del usuario actual
  - [x] 1.2.3 Agregar botón primario "Ir a mi perfil"
  - [x] 1.2.4 Agregar botón secundario "Cerrar sesión"
  - [x] 1.2.5 Agregar link "Cambiar de cuenta"
  - [x] 1.2.6 Implementar handlers para cada acción

- [x] 1.3 Manejar estado de sesión expirada
  - [x] 1.3.1 Detectar query param `?expired=true`
  - [x] 1.3.2 Mostrar mensaje "Tu sesión expiró"
  - [x] 1.3.3 Agregar botón "Reiniciar sesión"
  - [x] 1.3.4 Usar color de alerta (amarillo/naranja)

- [x] 1.4 Testing de login inteligente
  - [x] 1.4.1 Test: Usuario sin sesión ve formulario
  - [x] 1.4.2 Test: Usuario con sesión ve AlreadyLoggedInView
  - [x] 1.4.3 Test: Sesión expirada muestra mensaje correcto
  - [x] 1.4.4 Test: Botones funcionan correctamente

### 2. Componente UserMenu con Dropdown

- [x] 2.1 Crear componente base `UserMenu`
  - [x] 2.1.1 Instalar `@headlessui/react` o `@radix-ui/react-dropdown-menu`
  - [x] 2.1.2 Crear estructura básica del componente
  - [x] 2.1.3 Agregar hook `useAuth()` para obtener usuario

- [x] 2.2 Implementar Avatar con iniciales
  - [x] 2.2.1 Crear componente `Avatar`
  - [x] 2.2.2 Extraer primera letra del email
  - [x] 2.2.3 Aplicar estilos (círculo azul, letra blanca)
  - [x] 2.2.4 Agregar hover effect

- [x] 2.3 Implementar Dropdown Menu
  - [x] 2.3.1 Configurar Menu de Headless UI
  - [x] 2.3.2 Agregar animación fade-in + slide-down
  - [x] 2.3.3 Implementar cierre al click fuera
  - [x] 2.3.4 Agregar keyboard navigation (Tab, Enter, Escape)

- [x] 2.4 Agregar opciones del menú
  - [x] 2.4.1 Mostrar email del usuario (no clickeable)
  - [x] 2.4.2 Agregar separador
  - [x] 2.4.3 Opción "Mi perfil" → `/profile`
  - [x] 2.4.4 Opción "Seguridad" → `/security` (placeholder)
  - [x] 2.4.5 Opción "Configuración" → `/settings` (placeholder)
  - [x] 2.4.6 Agregar separador
  - [x] 2.4.7 Opción "Cerrar sesión" (texto rojo) → `logout()`

- [x] 2.5 Agregar iconos con Heroicons
  - [x] 2.5.1 Icono UserCircleIcon para "Mi perfil"
  - [x] 2.5.2 Icono LockClosedIcon para "Seguridad"
  - [x] 2.5.3 Icono Cog6ToothIcon para "Configuración"
  - [x] 2.5.4 Icono ArrowRightOnRectangleIcon para "Cerrar sesión"

- [x] 2.6 Testing de UserMenu
  - [x] 2.6.1 Test: Avatar muestra iniciales correctas
  - [x] 2.6.2 Test: Dropdown abre/cierra correctamente
  - [x] 2.6.3 Test: Navegación funciona
  - [x] 2.6.4 Test: Logout ejecuta correctamente
  - [x] 2.6.5 Test: Keyboard navigation funciona

### 3. Navbar Responsive

- [x] 3.1 Crear componente `Navbar`
  - [x] 3.1.1 Crear estructura básica
  - [x] 3.1.2 Agregar logo/título "PolizaLab CRM"
  - [x] 3.1.3 Integrar UserMenu en esquina derecha

- [x] 3.2 Implementar versión desktop
  - [x] 3.2.1 Layout horizontal
  - [x] 3.2.2 UserMenu visible en esquina derecha
  - [x] 3.2.3 Agregar padding y estilos

- [x] 3.3 Implementar versión mobile
  - [x] 3.3.1 Agregar menú hamburguesa
  - [x] 3.3.2 Drawer/sidebar para navegación
  - [x] 3.3.3 UserMenu en drawer
  - [x] 3.3.4 Responsive breakpoint en 768px

- [x] 3.4 Integrar Navbar en layout principal
  - [x] 3.4.1 Agregar Navbar a `app/layout.tsx`
  - [x] 3.4.2 Mostrar solo cuando `isAuthenticated === true`
  - [x] 3.4.3 Ajustar padding del contenido principal

- [x] 3.5 Testing de Navbar
  - [x] 3.5.1 Test: Navbar se muestra cuando autenticado
  - [x] 3.5.2 Test: Navbar no se muestra cuando no autenticado
  - [x] 3.5.3 Test: Responsive funciona correctamente
  - [x] 3.5.4 Test: Menú hamburguesa funciona en mobile

### 4. Manejo de Sesión Expirada

- [x] 4.1 Detectar token refresh failure en AuthProvider
  - [x] 4.1.1 Agregar listener para `tokenRefresh_failure`
  - [x] 4.1.2 Actualizar estado a no autenticado
  - [x] 4.1.3 Mostrar error "Sesión expirada"
  - [x] 4.1.4 Redirect a `/login?expired=true`

- [x] 4.2 Manejar errores 401 en API calls
  - [x] 4.2.1 Modificar `lib/api-client.ts`
  - [x] 4.2.2 Detectar response.status === 401
  - [x] 4.2.3 Mostrar toast "Tu sesión expiró"
  - [x] 4.2.4 Ejecutar `logout()`
  - [x] 4.2.5 Redirect a `/login?expired=true`

- [x] 4.3 Implementar sistema de toasts
  - [x] 4.3.1 Instalar `react-hot-toast`
  - [x] 4.3.2 Configurar Toaster en layout
  - [x] 4.3.3 Crear helpers para toast.success/error/warning

- [x] 4.4 Testing de sesión expirada
  - [x] 4.4.1 Test: tokenRefresh_failure redirige correctamente
  - [x] 4.4.2 Test: 401 en API muestra toast y redirige
  - [x] 4.4.3 Test: Usuario puede volver a hacer login

### 5. Mejoras en AuthProvider

- [ ] 5.1 Agregar método público `checkSession()`
  - [ ] 5.1.1 Implementar método en AuthProvider
  - [ ] 5.1.2 Retornar estado actual de sesión
  - [ ] 5.1.3 Exportar en AuthContextValue

- [ ] 5.2 Mejorar manejo de errores
  - [ ] 5.2.1 Distinguir entre sesión expirada y error de red
  - [ ] 5.2.2 Agregar retry logic para errores de red
  - [ ] 5.2.3 Mejorar mensajes de error

- [ ] 5.3 Testing de AuthProvider
  - [ ] 5.3.1 Test: loadUser funciona correctamente
  - [ ] 5.3.2 Test: Hub listeners funcionan
  - [ ] 5.3.3 Test: checkSession retorna estado correcto

---

## Fase 2: Mejoras de Perfil (IMPORTANTE)

### 6. Foto de Perfil con Upload a S3

- [ ] 6.1 Diseñar UI de foto de perfil
  - [ ] 6.1.1 Crear sección header en página de perfil
  - [ ] 6.1.2 Avatar grande (120px x 120px)
  - [ ] 6.1.3 Botón "Cambiar foto"
  - [ ] 6.1.4 Mostrar nombre y email del usuario

- [ ] 6.2 Implementar file picker
  - [ ] 6.2.1 Instalar `react-dropzone`
  - [ ] 6.2.2 Configurar accept: image/jpeg, image/png
  - [ ] 6.2.3 Validar tamaño máximo (2MB)
  - [ ] 6.2.4 Mostrar errores de validación

- [ ] 6.3 Implementar preview de imagen
  - [ ] 6.3.1 Crear componente ImagePreview
  - [ ] 6.3.2 Mostrar imagen seleccionada
  - [ ] 6.3.3 Botones "Guardar" y "Cancelar"
  - [ ] 6.3.4 Crop/resize opcional

- [ ] 6.4 Crear Lambda para pre-signed URLs
  - [ ] 6.4.1 Crear `lambda/profile-image-upload/index.ts`
  - [ ] 6.4.2 Generar pre-signed URL para S3
  - [ ] 6.4.3 Validar usuario autenticado
  - [ ] 6.4.4 Configurar CORS
  - [ ] 6.4.5 Deploy Lambda

- [ ] 6.5 Crear S3 bucket para fotos
  - [ ] 6.5.1 Crear bucket `polizalab-profile-images`
  - [ ] 6.5.2 Configurar bucket policy
  - [ ] 6.5.3 Habilitar CORS
  - [ ] 6.5.4 Configurar lifecycle rules (opcional)

- [ ] 6.6 Implementar upload a S3
  - [ ] 6.6.1 Request pre-signed URL a Lambda
  - [ ] 6.6.2 Upload imagen a S3 con pre-signed URL
  - [ ] 6.6.3 Mostrar progress bar
  - [ ] 6.6.4 Manejar errores de upload

- [ ] 6.7 Guardar URL en DynamoDB
  - [ ] 6.7.1 Agregar campo `profileImageUrl` a tabla profiles
  - [ ] 6.7.2 Actualizar profile_handler.py
  - [ ] 6.7.3 Endpoint PUT /profile con imageUrl
  - [ ] 6.7.4 Validar URL de S3

- [ ] 6.8 Mostrar foto de perfil
  - [ ] 6.8.1 Cargar URL desde API
  - [ ] 6.8.2 Mostrar en Avatar grande
  - [ ] 6.8.3 Mostrar en UserMenu (avatar pequeño)
  - [ ] 6.8.4 Fallback a iniciales si no hay foto

- [ ] 6.9 Testing de foto de perfil
  - [ ] 6.9.1 Test: File picker valida correctamente
  - [ ] 6.9.2 Test: Preview muestra imagen
  - [ ] 6.9.3 Test: Upload a S3 funciona
  - [ ] 6.9.4 Test: URL se guarda en DynamoDB
  - [ ] 6.9.5 Test: Foto se muestra correctamente

### 7. Información de Cuenta (Solo Lectura)

- [ ] 7.1 Crear sección "Información de Cuenta"
  - [ ] 7.1.1 Diseñar card con título e icono
  - [ ] 7.1.2 Agregar a página de perfil

- [ ] 7.2 Mostrar email verificado
  - [ ] 7.2.1 Obtener `email_verified` de Cognito
  - [ ] 7.2.2 Mostrar badge verde (✓) o rojo (✗)
  - [ ] 7.2.3 Texto "Email verificado: Sí/No"

- [ ] 7.3 Mostrar fecha de registro
  - [ ] 7.3.1 Obtener `createdAt` de DynamoDB
  - [ ] 7.3.2 Formatear con date-fns
  - [ ] 7.3.3 Mostrar "Fecha de registro: 15 Feb 2026"

- [ ] 7.4 Mostrar último inicio de sesión
  - [ ] 7.4.1 Guardar `lastLoginAt` en DynamoDB
  - [ ] 7.4.2 Actualizar en cada login
  - [ ] 7.4.3 Formatear como relativo "Hace 5 minutos"

- [ ] 7.5 Mostrar ID de usuario
  - [ ] 7.5.1 Obtener `sub` de Cognito
  - [ ] 7.5.2 Ocultar por defecto (••••••••)
  - [ ] 7.5.3 Botón "Mostrar" para revelar
  - [ ] 7.5.4 Botón "Copiar" para copiar al clipboard

- [ ] 7.6 Testing de información de cuenta
  - [ ] 7.6.1 Test: Email verificado muestra correctamente
  - [ ] 7.6.2 Test: Fechas se formatean correctamente
  - [ ] 7.6.3 Test: ID se oculta/muestra correctamente
  - [ ] 7.6.4 Test: Copiar al clipboard funciona

### 8. Preferencias de Usuario

- [ ] 8.1 Crear sección "Preferencias"
  - [ ] 8.1.1 Diseñar card con título e icono
  - [ ] 8.1.2 Agregar a página de perfil

- [ ] 8.2 Implementar selector de idioma
  - [ ] 8.2.1 Dropdown con opciones (por ahora solo Español)
  - [ ] 8.2.2 Guardar en DynamoDB
  - [ ] 8.2.3 Placeholder para i18n futuro

- [ ] 8.3 Implementar selector de zona horaria
  - [ ] 8.3.1 Auto-detectar zona horaria del navegador
  - [ ] 8.3.2 Dropdown con zonas horarias comunes
  - [ ] 8.3.3 Guardar en DynamoDB
  - [ ] 8.3.4 Usar para formatear fechas

- [ ] 8.4 Implementar toggle de notificaciones
  - [ ] 8.4.1 Toggle switch para "Notificaciones por email"
  - [ ] 8.4.2 Guardar preferencia en DynamoDB
  - [ ] 8.4.3 Usar en sistema de notificaciones futuro

- [ ] 8.5 Botón "Guardar preferencias"
  - [ ] 8.5.1 Disabled si no hay cambios
  - [ ] 8.5.2 Loading state mientras guarda
  - [ ] 8.5.3 Toast de éxito/error
  - [ ] 8.5.4 Actualizar estado local

- [ ] 8.6 Testing de preferencias
  - [ ] 8.6.1 Test: Idioma se guarda correctamente
  - [ ] 8.6.2 Test: Zona horaria se detecta y guarda
  - [ ] 8.6.3 Test: Toggle de notificaciones funciona
  - [ ] 8.6.4 Test: Botón guardar funciona correctamente

### 9. Mejorar Sección de Información Personal

- [ ] 9.1 Rediseñar UI existente
  - [ ] 9.1.1 Usar mismo estilo de cards que otras secciones
  - [ ] 9.1.2 Agregar icono al título
  - [ ] 9.1.3 Mejorar spacing y layout

- [ ] 9.2 Mejorar validación de campos
  - [ ] 9.2.1 Validación en tiempo real
  - [ ] 9.2.2 Mensajes de error claros
  - [ ] 9.2.3 Validación de formato de teléfono

- [ ] 9.3 Agregar indicador de cambios no guardados
  - [ ] 9.3.1 Detectar cambios en formulario
  - [ ] 9.3.2 Mostrar badge "Cambios sin guardar"
  - [ ] 9.3.3 Confirmar antes de salir de página

- [ ] 9.4 Testing de información personal
  - [ ] 9.4.1 Test: Validación funciona correctamente
  - [ ] 9.4.2 Test: Cambios se guardan
  - [ ] 9.4.3 Test: Indicador de cambios funciona

---

## Fase 3: Features Avanzados (FUTURO)

### 10. Sesiones Activas (Múltiples Dispositivos)

- [ ] 10.1 Crear tabla de sesiones en DynamoDB
  - [ ] 10.1.1 Diseñar schema de tabla
  - [ ] 10.1.2 Crear tabla `user-sessions`
  - [ ] 10.1.3 Configurar TTL para auto-limpieza

- [ ] 10.2 Registrar sesiones en login
  - [ ] 10.2.1 Detectar dispositivo/navegador
  - [ ] 10.2.2 Obtener IP y ubicación aproximada
  - [ ] 10.2.3 Guardar en DynamoDB

- [ ] 10.3 Crear sección "Sesiones Activas"
  - [ ] 10.3.1 Diseñar UI de lista de sesiones
  - [ ] 10.3.2 Mostrar info de cada sesión
  - [ ] 10.3.3 Marcar sesión actual

- [ ] 10.4 Implementar "Cerrar sesión"
  - [ ] 10.4.1 Botón para cerrar sesión específica
  - [ ] 10.4.2 Botón "Cerrar todas excepto esta"
  - [ ] 10.4.3 Invalidar tokens en Cognito

- [ ] 10.5 Testing de sesiones activas
  - [ ] 10.5.1 Test: Sesiones se registran correctamente
  - [ ] 10.5.2 Test: Lista se muestra correctamente
  - [ ] 10.5.3 Test: Cerrar sesión funciona

### 11. Cambio de Contraseña

- [ ] 11.1 Crear página `/security`
  - [ ] 11.1.1 Diseñar layout de página
  - [ ] 11.1.2 Agregar a navegación

- [ ] 11.2 Implementar formulario de cambio de contraseña
  - [ ] 11.2.1 Campo "Contraseña actual"
  - [ ] 11.2.2 Campo "Nueva contraseña"
  - [ ] 11.2.3 Campo "Confirmar nueva contraseña"
  - [ ] 11.2.4 Validación de requisitos de contraseña

- [ ] 11.3 Integrar con Cognito
  - [ ] 11.3.1 Usar `changePassword` de Amplify
  - [ ] 11.3.2 Manejar errores
  - [ ] 11.3.3 Mostrar éxito

- [ ] 11.4 Testing de cambio de contraseña
  - [ ] 11.4.1 Test: Validación funciona
  - [ ] 11.4.2 Test: Cambio exitoso
  - [ ] 11.4.3 Test: Errores se manejan correctamente

### 12. Autenticación de Dos Factores (2FA)

- [ ] 12.1 Configurar MFA en Cognito
  - [ ] 12.1.1 Habilitar TOTP en User Pool
  - [ ] 12.1.2 Configurar políticas de MFA

- [ ] 12.2 Implementar setup de 2FA
  - [ ] 12.2.1 Generar QR code
  - [ ] 12.2.2 Verificar código TOTP
  - [ ] 12.2.3 Guardar preferencia

- [ ] 12.3 Implementar login con 2FA
  - [ ] 12.3.1 Detectar si usuario tiene 2FA
  - [ ] 12.3.2 Solicitar código después de password
  - [ ] 12.3.3 Verificar código

- [ ] 12.4 Testing de 2FA
  - [ ] 12.4.1 Test: Setup funciona
  - [ ] 12.4.2 Test: Login con 2FA funciona
  - [ ] 12.4.3 Test: Códigos inválidos se rechazan

---

## Tareas Transversales

### 13. Documentación

- [ ] 13.1 Actualizar README.md
  - [ ] 13.1.1 Documentar nuevas features
  - [ ] 13.1.2 Agregar screenshots
  - [ ] 13.1.3 Actualizar instrucciones de setup

- [ ] 13.2 Crear guía de usuario
  - [ ] 13.2.1 Cómo cambiar foto de perfil
  - [ ] 13.2.2 Cómo cerrar sesión
  - [ ] 13.2.3 Cómo cambiar preferencias

- [ ] 13.3 Documentar APIs
  - [ ] 13.3.1 Endpoint de pre-signed URLs
  - [ ] 13.3.2 Endpoints de perfil actualizados
  - [ ] 13.3.3 Formato de respuestas

### 14. Testing End-to-End

- [ ] 14.1 Crear tests E2E con Playwright
  - [ ] 14.1.1 Instalar Playwright
  - [ ] 14.1.2 Configurar tests

- [ ] 14.2 Tests de flujo completo
  - [ ] 14.2.1 Test: Registro → Login → Perfil
  - [ ] 14.2.2 Test: Login con sesión activa
  - [ ] 14.2.3 Test: Cerrar sesión → Login
  - [ ] 14.2.4 Test: Cambiar foto de perfil
  - [ ] 14.2.5 Test: Actualizar preferencias

- [ ] 14.3 Tests de sesión expirada
  - [ ] 14.3.1 Test: Token expira durante uso
  - [ ] 14.3.2 Test: Redirect a login
  - [ ] 14.3.3 Test: Re-login funciona

### 15. Performance y Optimización

- [ ] 15.1 Optimizar carga de imágenes
  - [ ] 15.1.1 Lazy loading de avatares
  - [ ] 15.1.2 Resize automático en S3
  - [ ] 15.1.3 CDN para imágenes

- [ ] 15.2 Optimizar bundle size
  - [ ] 15.2.1 Code splitting de componentes pesados
  - [ ] 15.2.2 Tree shaking de librerías
  - [ ] 15.2.3 Analizar bundle con webpack-bundle-analyzer

- [ ] 15.3 Mejorar tiempo de carga
  - [ ] 15.3.1 Prefetch de datos de perfil
  - [ ] 15.3.2 Cache de datos en memoria
  - [ ] 15.3.3 Skeleton loaders

### 16. Accesibilidad

- [ ] 16.1 Auditoría de accesibilidad
  - [ ] 16.1.1 Ejecutar Lighthouse
  - [ ] 16.1.2 Ejecutar axe DevTools
  - [ ] 16.1.3 Corregir issues encontrados

- [ ] 16.2 Mejorar navegación por teclado
  - [ ] 16.2.1 Tab order correcto
  - [ ] 16.2.2 Focus visible
  - [ ] 16.2.3 Shortcuts de teclado

- [ ] 16.3 Mejorar screen reader support
  - [ ] 16.3.1 Agregar aria-labels
  - [ ] 16.3.2 Agregar aria-describedby
  - [ ] 16.3.3 Anunciar cambios dinámicos

### 17. Deployment y Monitoreo

- [ ] 17.1 Deploy Fase 1 a producción
  - [ ] 17.1.1 Build y test
  - [ ] 17.1.2 Deploy a S3
  - [ ] 17.1.3 Invalidar cache de CloudFront
  - [ ] 17.1.4 Verificar en producción

- [ ] 17.2 Configurar monitoreo
  - [ ] 17.2.1 CloudWatch Logs para Lambdas
  - [ ] 17.2.2 Alarmas para errores
  - [ ] 17.2.3 Dashboard de métricas

- [ ] 17.3 Monitorear métricas de usuario
  - [ ] 17.3.1 Tasa de error "already signed in"
  - [ ] 17.3.2 Tiempo promedio en login
  - [ ] 17.3.3 Tasa de abandono

---

## Estimaciones de Tiempo

| Fase | Tareas | Tiempo Estimado |
|------|--------|-----------------|
| Fase 1: Gestión de Sesiones | 1-5 | 9-13 horas |
| Fase 2: Mejoras de Perfil | 6-9 | 8-12 horas |
| Fase 3: Features Avanzados | 10-12 | 15-20 horas |
| Transversales | 13-17 | 6-8 horas |
| **TOTAL** | | **38-53 horas** |

## Priorización

### Sprint 1 (Esta semana)
- Tareas 1-5 (Fase 1 completa)
- Tarea 13.1 (Documentación básica)
- Tarea 17.1 (Deploy)

### Sprint 2 (Próxima semana)
- Tareas 6-9 (Fase 2 completa)
- Tarea 14 (Testing E2E)
- Tarea 17.2 (Monitoreo)

### Sprint 3 (Futuro)
- Tareas 10-12 (Fase 3)
- Tareas 15-16 (Performance y Accesibilidad)

## Notas

- Todas las tareas deben seguir los estándares del proyecto (ver `.kiro/steering/project-standards.md`)
- No usar emojis en el código, usar Heroicons
- Siempre hacer build antes de commit
- Escribir tests para funcionalidad crítica
- Mantener accesibilidad en mente (ARIA labels, keyboard navigation)
