# Resumen Ejecutivo: Gestión de Sesiones y Mejoras de Perfil

## Problema Actual

El usuario recibe el error **"There is already a signed in user"** cuando intenta hacer login con una sesión ya activa. Esto genera confusión y mala experiencia de usuario.

## Solución Propuesta

### 1. Login Inteligente (Prioridad ALTA)

**Cambio:** La página `/login` debe detectar si ya hay sesión activa ANTES de mostrar el formulario.

**Implementación:**
```typescript
// En app/login/page.tsx
const { isAuthenticated, isLoading, user } = useAuth();

if (isLoading) {
  return <LoadingSpinner text="Verificando sesión..." />;
}

if (isAuthenticated) {
  return (
    <AlreadyLoggedInView 
      email={user?.email}
      onGoToProfile={() => router.push('/profile')}
      onLogout={async () => {
        await logout();
        // Mostrar formulario
      }}
    />
  );
}

// Mostrar formulario normal
return <LoginForm />;
```

**Beneficio:** Elimina el error y mejora la UX.

---

### 2. Botón de Cerrar Sesión (Prioridad ALTA)

**Cambio:** Agregar un `UserMenu` visible en todas las páginas cuando el usuario está autenticado.

**Ubicación:** Esquina superior derecha de la navbar.

**Componentes:**
- Avatar con iniciales
- Dropdown con opciones:
  - Mi perfil
  - Seguridad (placeholder)
  - Configuración (placeholder)
  - **Cerrar sesión** (ejecuta `logout()`)

**Implementación:**
```typescript
// components/UserMenu.tsx
export function UserMenu() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Menu as="div" className="relative">
      <Menu.Button>
        <Avatar initials={user?.email[0].toUpperCase()} />
      </Menu.Button>
      
      <Menu.Items>
        <Menu.Item>
          <Link href="/profile">Mi perfil</Link>
        </Menu.Item>
        <Menu.Item>
          <button onClick={logout}>Cerrar sesión</button>
        </Menu.Item>
      </Menu.Items>
    </Menu>
  );
}
```

**Beneficio:** Usuario puede cerrar sesión fácilmente desde cualquier página.

---

### 3. Mejoras en Página de Perfil (Prioridad MEDIA)

**Secciones a agregar:**

#### a) Foto de Perfil
- Avatar grande (120px)
- Botón "Cambiar foto"
- Upload a S3 con pre-signed URL
- Preview antes de guardar

#### b) Información de Cuenta (Solo lectura)
- Email verificado: ✓ o ✗
- Fecha de registro
- Último inicio de sesión
- ID de usuario (oculto, botón "Mostrar")

#### c) Preferencias
- Idioma: Español (por ahora)
- Zona horaria: Auto-detectada
- Notificaciones por email: Toggle on/off

**Beneficio:** Perfil más completo y profesional.

---

### 4. Manejo de Sesión Expirada (Prioridad MEDIA)

**Cambio:** Detectar cuando el token expira y manejar gracefully.

**Implementación:**
```typescript
// En AuthProvider
Hub.listen('auth', ({ payload }) => {
  if (payload.event === 'tokenRefresh_failure') {
    // Token expiró
    setState({ 
      user: null, 
      isAuthenticated: false,
      error: 'Sesión expirada' 
    });
    router.push('/login?expired=true');
  }
});
```

**En API calls:**
```typescript
// lib/api-client.ts
if (response.status === 401) {
  // Token inválido
  toast.error('Tu sesión expiró');
  await logout();
  router.push('/login?expired=true');
}
```

**Beneficio:** Usuario entiende por qué necesita volver a hacer login.

---

### 5. Sincronización entre Tabs (Prioridad BAJA)

**Cambio:** Si usuario cierra sesión en un tab, cerrar en todos.

**Implementación:**
```typescript
// Ya está implementado con Hub.listen('auth')
// Amplify sincroniza automáticamente entre tabs
```

**Beneficio:** Consistencia en la experiencia.

---

## Priorización de Implementación

### Fase 1: Crítico (Esta semana)
1. ✅ Login inteligente con detección de sesión
2. ✅ UserMenu con botón de cerrar sesión
3. ✅ Manejo básico de sesión expirada

### Fase 2: Importante (Próxima semana)
4. Foto de perfil con upload a S3
5. Información de cuenta (readonly)
6. Preferencias básicas

### Fase 3: Nice-to-have (Futuro)
7. Sesiones activas (lista de dispositivos)
8. Cambio de contraseña
9. Autenticación de dos factores (2FA)

---

## Estimación de Esfuerzo

| Tarea | Tiempo | Complejidad |
|-------|--------|-------------|
| Login inteligente | 2-3 horas | Baja |
| UserMenu component | 3-4 horas | Media |
| Navbar responsive | 2-3 horas | Baja |
| Manejo sesión expirada | 2-3 horas | Media |
| Foto de perfil | 4-6 horas | Alta |
| Info de cuenta | 2-3 horas | Baja |
| Preferencias | 2-3 horas | Baja |
| **TOTAL FASE 1** | **9-13 horas** | - |
| **TOTAL FASE 2** | **8-12 horas** | - |

---

## Riesgos y Mitigaciones

### Riesgo 1: Flickering en detección de sesión
**Mitigación:** Usar `isLoading` state y mostrar spinner breve (<500ms)

### Riesgo 2: Upload de foto falla
**Mitigación:** Validar tamaño/formato antes de upload, mostrar errores claros

### Riesgo 3: Sesión expirada durante operación crítica
**Mitigación:** Guardar estado en localStorage, restaurar después de re-login

### Riesgo 4: Múltiples tabs causan race conditions
**Mitigación:** Amplify Hub ya maneja esto, pero agregar tests

---

## Métricas de Éxito

1. **Error "already signed in":** Reducir a 0%
2. **Tiempo para cerrar sesión:** <2 clicks
3. **Tasa de abandono en login:** <5%
4. **Satisfacción de usuario:** >4.5/5

---

## Checklist de Implementación

### Fase 1: Sesiones
- [ ] Modificar `/login` para detectar sesión activa
- [ ] Crear componente `AlreadyLoggedInView`
- [ ] Crear componente `UserMenu` con dropdown
- [ ] Crear componente `Navbar` responsive
- [ ] Agregar `UserMenu` a layout principal
- [ ] Implementar manejo de `tokenRefresh_failure`
- [ ] Agregar redirect con query param `?expired=true`
- [ ] Mostrar mensaje apropiado en login expirado
- [ ] Testing manual de todos los flujos
- [ ] Testing en múltiples navegadores

### Fase 2: Perfil
- [ ] Diseñar UI de foto de perfil
- [ ] Implementar file picker con validación
- [ ] Crear Lambda para pre-signed URLs
- [ ] Implementar upload a S3
- [ ] Guardar URL en DynamoDB
- [ ] Agregar sección "Información de cuenta"
- [ ] Agregar sección "Preferencias"
- [ ] Implementar toggle de notificaciones
- [ ] Testing de upload de imágenes
- [ ] Testing de guardado de preferencias

---

## Recursos Necesarios

### Librerías
- `@headlessui/react` o `@radix-ui/react-dropdown-menu` (UserMenu)
- `react-hot-toast` (Notificaciones)
- `date-fns` (Formateo de fechas)
- `react-dropzone` (Upload de fotos)

### AWS
- Lambda para generar pre-signed URLs
- S3 bucket para fotos de perfil
- DynamoDB para guardar URL de foto

### Diseño
- Heroicons para todos los iconos
- Tailwind CSS para estilos
- Componentes accesibles (ARIA labels)

---

## Próximos Pasos Inmediatos

1. **Revisar y aprobar** este documento
2. **Crear spec técnico** detallado para Fase 1
3. **Implementar** login inteligente (2-3 horas)
4. **Implementar** UserMenu (3-4 horas)
5. **Testing** exhaustivo (2 horas)
6. **Deploy** a producción
7. **Monitorear** métricas y errores

---

## Preguntas Abiertas

1. ¿Queremos permitir login con Google/Facebook en el futuro?
2. ¿Necesitamos guardar historial de cambios en el perfil?
3. ¿Queremos notificaciones push además de email?
4. ¿Cuál es el límite de tamaño para fotos de perfil? (Recomendado: 2MB)
5. ¿Necesitamos crop de imágenes o solo resize?

---

**Última actualización:** 19 Feb 2026  
**Autor:** Equipo de Desarrollo PolizaLab  
**Estado:** Pendiente de aprobación
