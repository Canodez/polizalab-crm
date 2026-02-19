---
inclusion: always
---

# PolizaLab Project Standards

Este documento define los estándares y mejores prácticas que deben seguirse en el proyecto PolizaLab CRM.

## Iconos y UI

### ❌ NO usar emojis en el código

Los emojis no deben usarse en la interfaz de usuario del proyecto. En su lugar, usa una librería de iconos profesional.

**Mal:**
```tsx
<div className="text-4xl mb-4">📋</div>
<div className="text-4xl mb-4">👥</div>
<div className="text-4xl mb-4">📊</div>
```

**Bien:**
```tsx
import { ClipboardDocumentListIcon, UsersIcon, ChartBarIcon } from '@heroicons/react/24/outline';

<ClipboardDocumentListIcon className="w-12 h-12 text-blue-600 mb-4" />
<UsersIcon className="w-12 h-12 text-blue-600 mb-4" />
<ChartBarIcon className="w-12 h-12 text-blue-600 mb-4" />
```

### Librerías de iconos recomendadas

1. **Heroicons** (Recomendado para este proyecto)
   ```bash
   npm install @heroicons/react
   ```
   - Diseñados por los creadores de Tailwind CSS
   - Dos estilos: outline y solid
   - Perfectamente integrados con Tailwind

2. **Lucide React** (Alternativa)
   ```bash
   npm install lucide-react
   ```
   - Fork mejorado de Feather Icons
   - Más de 1000 iconos
   - Muy ligero

3. **React Icons** (Para más variedad)
   ```bash
   npm install react-icons
   ```
   - Incluye Font Awesome, Material Design, etc.
   - Más pesado pero más opciones

## Build y Deployment

### ✅ SIEMPRE hacer build antes de:

1. **Probar en local**
   ```bash
   npm run build
   npm run start  # Para probar el build de producción
   ```

2. **Subir cambios a Git**
   ```bash
   # Antes de commit
   npm run build
   
   # Si el build es exitoso, entonces commit
   git add .
   git commit -m "feat: descripción del cambio"
   git push origin master
   ```

3. **Deployment a producción**
   ```bash
   # Build
   npm run build
   
   # Deploy
   aws s3 sync out/ s3://polizalab-crm-frontend/ --delete --cache-control "public, max-age=31536000, immutable" --exclude "*.html" --exclude "*.json"
   aws s3 sync out/ s3://polizalab-crm-frontend/ --cache-control "public, max-age=0, must-revalidate" --exclude "*" --include "*.html" --include "*.json"
   
   # Invalidate cache
   aws cloudfront create-invalidation --distribution-id E1WB95BQGR0YAT --paths "/*"
   ```

### Por qué es importante

- **Detecta errores de TypeScript** antes de deployment
- **Verifica que el static export funcione** correctamente
- **Previene deployments rotos** en producción
- **Asegura que el código compile** sin errores
- **Valida que no haya dependencias faltantes**

### Workflow recomendado

```bash
# 1. Hacer cambios en el código
# 2. Verificar que compile
npm run build

# 3. Si hay errores, corregirlos y volver al paso 2
# 4. Si el build es exitoso, probar localmente
npm run start

# 5. Si todo funciona, hacer commit
git add .
git commit -m "feat: descripción"
git push

# 6. Deploy a producción (si es necesario)
# Ver comandos arriba
```

## Reglas de Código

### TypeScript

- Siempre usar tipos explícitos cuando sea posible
- No usar `any` a menos que sea absolutamente necesario
- Usar interfaces para objetos complejos

### React

- Usar componentes funcionales con hooks
- Usar `'use client'` solo cuando sea necesario (interactividad)
- Mantener componentes pequeños y reutilizables

### Tailwind CSS

- Usar clases de Tailwind en lugar de CSS custom
- Mantener consistencia en spacing (usar escala de Tailwind)
- Usar variables de color del tema

### Accesibilidad

- Siempre incluir `alt` en imágenes
- Usar etiquetas semánticas HTML
- Incluir `aria-label` cuando sea necesario
- Asegurar contraste de colores adecuado

## Git Commit Messages

Usar conventional commits:

- `feat:` - Nueva funcionalidad
- `fix:` - Corrección de bug
- `docs:` - Cambios en documentación
- `style:` - Cambios de formato (no afectan código)
- `refactor:` - Refactorización de código
- `test:` - Agregar o modificar tests
- `chore:` - Tareas de mantenimiento

Ejemplo:
```bash
git commit -m "feat: add user profile page with avatar upload"
git commit -m "fix: resolve login redirect issue"
git commit -m "docs: update deployment guide"
```

## Estructura de Archivos

```
app/
  ├── (route)/
  │   ├── page.tsx          # Página principal
  │   ├── layout.tsx        # Layout (si es necesario)
  │   └── __tests__/        # Tests de la página
  │       └── page.test.tsx
lib/
  ├── utils.ts              # Utilidades generales
  ├── api-client.ts         # Cliente API
  └── __tests__/            # Tests de lib
components/
  ├── ui/                   # Componentes UI reutilizables
  └── features/             # Componentes específicos de features
```

## Configuración de AWS

### AWS CLI

**Versiones instaladas:**
- AWS CLI v1: `C:\Program Files\Amazon\AWSCLI\bin\aws.exe` (aws-cli/1.18.203)
- AWS CLI v2: `C:\Program Files\Amazon\AWSCLIV2\aws.exe` (aws-cli/2.33.2) ✅ **USAR ESTA**

**Importante:**
- Para operaciones de CloudFront Functions, S3, y otros servicios modernos, SIEMPRE usar AWS CLI v2
- AWS CLI v1 no soporta CloudFront Functions API
- En scripts de PowerShell, usar la ruta completa: `& "C:\Program Files\Amazon\AWSCLIV2\aws.exe"`

**Ejemplo de uso en scripts:**
```powershell
# Usar AWS CLI v2 explícitamente
$awsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
& $awsCmd cloudfront create-function --name my-function ...
```

### API Gateway - CORS

El API Gateway debe estar configurado para aceptar peticiones desde los siguientes orígenes:

**Orígenes permitidos (Access-Control-Allow-Origin):**
- `http://localhost:3000` (desarrollo local)
- `https://d4srl7zbv9blh.cloudfront.net` (CloudFront)
- `https://crm.antesdefirmar.org` (dominio personalizado)

**Headers requeridos:**
- `Access-Control-Allow-Origin`: Debe incluir los orígenes listados arriba
- `Access-Control-Allow-Methods`: `GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers`: `Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token`
- `Access-Control-Allow-Credentials`: `true` (si se usan cookies/credenciales)

**Endpoints que requieren CORS:**
- `/profile` (GET, PUT)
- `/policies` (GET, POST, PUT, DELETE)
- Todos los endpoints de la API

### Verificación de CORS

Para verificar que CORS está configurado correctamente:

```bash
# Verificar desde localhost
curl -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -X OPTIONS \
  https://f34orvshp5.execute-api.us-east-1.amazonaws.com/prod/profile

# Verificar desde CloudFront
curl -H "Origin: https://d4srl7zbv9blh.cloudfront.net" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -X OPTIONS \
  https://f34orvshp5.execute-api.us-east-1.amazonaws.com/prod/profile

# Verificar desde dominio personalizado
curl -H "Origin: https://crm.antesdefirmar.org" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -X OPTIONS \
  https://f34orvshp5.execute-api.us-east-1.amazonaws.com/prod/profile
```

La respuesta debe incluir los headers CORS correctos.

## Resumen de Reglas Críticas

1. ❌ **NO usar emojis** → ✅ Usar librería de iconos (Heroicons)
2. ✅ **SIEMPRE hacer build** antes de probar local o subir a Git
3. ✅ Usar TypeScript con tipos explícitos
4. ✅ Seguir conventional commits
5. ✅ Mantener accesibilidad en mente
6. ✅ Usar Tailwind CSS para estilos
7. ✅ Escribir tests para funcionalidad crítica
8. ✅ **CORS debe estar configurado** para localhost, CloudFront y dominio personalizado

---

**Nota**: Estas reglas están diseñadas para mantener la calidad del código y prevenir errores en producción. Síguelas consistentemente en todo el proyecto.
