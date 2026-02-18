# SPA Routing with CloudFront + S3 (OAC)

## Production Guide for React Single Page Applications

Esta guía explica cómo configurar correctamente el routing de una SPA (React, Next.js static export, Vite) desplegada en AWS usando CloudFront + S3 con Origin Access Control (OAC).

---

## 1. Por qué CloudFront retorna 403/404 para rutas de React

### El Problema

Cuando un usuario navega a `https://tu-dominio.com/login`:

1. **CloudFront** recibe la petición para `/login`
2. **CloudFront** busca el archivo `/login` en S3
3. **S3** no encuentra el archivo (porque no existe físicamente)
4. **S3** retorna:
   - `403 Forbidden` (si el bucket es privado con OAC)
   - `404 Not Found` (si el archivo simplemente no existe)
5. **CloudFront** pasa el error al navegador
6. **React Router nunca se carga** porque `index.html` nunca se sirvió

### Por qué sucede

- **SPAs usan client-side routing**: Las rutas como `/login`, `/documents/:id`, `/viewer` NO son archivos reales en S3
- **Solo existe `index.html`**: Este archivo contiene el código de React Router que maneja todas las rutas
- **S3 es un file server**: No entiende de routing dinámico, solo sirve archivos que existen físicamente

### Diferencia entre 403 y 404

- **403 Forbidden**: S3 con OAC retorna esto cuando el archivo no existe (por seguridad, no revela si el archivo existe o no)
- **404 Not Found**: S3 público o sin OAC retorna esto cuando el archivo no existe

**Con OAC (recomendado)**: Verás principalmente 403 para rutas que no existen.

---

## 2. Configuración Correcta: Custom Error Responses

### La Solución

Configurar CloudFront para que cuando S3 retorne 403 o 404, CloudFront sirva `index.html` con código HTTP 200.

### Configuración en CloudFront Console

1. Ve a tu distribución de CloudFront
2. Pestaña **Error Pages**
3. Crea dos custom error responses:

#### Error Response 1: 403 Forbidden

```
HTTP Error Code: 403
Customize Error Response: Yes
Response Page Path: /index.html
HTTP Response Code: 200
Error Caching Minimum TTL: 300 (5 minutos)
```

#### Error Response 2: 404 Not Found

```
HTTP Error Code: 404
Customize Error Response: Yes
Response Page Path: /index.html
HTTP Response Code: 200
Error Caching Minimum TTL: 300 (5 minutos)
```

### Configuración via AWS CLI

```bash
# Obtener configuración actual
aws cloudfront get-distribution-config --id YOUR_DISTRIBUTION_ID > dist-config.json

# Editar dist-config.json y agregar en CustomErrorResponses:
{
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      {
        "ErrorCode": 403,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 300
      },
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 300
      }
    ]
  }
}

# Actualizar distribución
aws cloudfront update-distribution --id YOUR_DISTRIBUTION_ID --distribution-config file://dist-config.json --if-match ETAG
```

### Configuración via CloudFormation/CDK

```yaml
# CloudFormation
CustomErrorResponses:
  - ErrorCode: 403
    ResponseCode: 200
    ResponsePagePath: /index.html
    ErrorCachingMinTTL: 300
  - ErrorCode: 404
    ResponseCode: 200
    ResponsePagePath: /index.html
    ErrorCachingMinTTL: 300
```

```typescript
// AWS CDK
distribution.addBehavior('*', origin, {
  viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
});

// Add error responses
const cfnDistribution = distribution.node.defaultChild as CfnDistribution;
cfnDistribution.addPropertyOverride('DistributionConfig.CustomErrorResponses', [
  {
    ErrorCode: 403,
    ResponseCode: 200,
    ResponsePagePath: '/index.html',
    ErrorCachingMinTTL: 300,
  },
  {
    ErrorCode: 404,
    ResponseCode: 200,
    ResponsePagePath: '/index.html',
    ErrorCachingMinTTL: 300,
  },
]);
```

---

## 3. Flujo Completo de Request

### Escenario: Usuario navega a `/login`

```
┌─────────────┐
│   Browser   │
│             │
│ GET /login  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│                     CloudFront                          │
│                                                         │
│  1. Recibe GET /login                                   │
│  2. Busca en cache (MISS en primera visita)            │
│  3. Forward request a S3 origin                         │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│                    S3 Bucket (Private + OAC)            │
│                                                         │
│  1. Recibe GET /login                                   │
│  2. Verifica OAC (✓ válido)                            │
│  3. Busca archivo /login                                │
│  4. Archivo NO existe                                   │
│  5. Retorna 403 Forbidden                               │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│                     CloudFront                          │
│                                                         │
│  1. Recibe 403 de S3                                    │
│  2. Consulta Custom Error Responses                     │
│  3. Encuentra: 403 → /index.html (200)                 │
│  4. Hace nueva request a S3 por /index.html             │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│                    S3 Bucket                            │
│                                                         │
│  1. Recibe GET /index.html                              │
│  2. Archivo EXISTE                                      │
│  3. Retorna index.html (200 OK)                         │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│                     CloudFront                          │
│                                                         │
│  1. Recibe index.html de S3                             │
│  2. Cachea según Cache-Control headers                  │
│  3. Retorna al browser con HTTP 200                     │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│                                                         │
│  1. Recibe index.html (HTTP 200)                        │
│  2. Parsea HTML, carga JavaScript                       │
│  3. React Router se inicializa                          │
│  4. React Router lee URL: /login                        │
│  5. React Router renderiza componente Login             │
│  6. Usuario ve la página de login ✓                    │
└─────────────────────────────────────────────────────────┘
```

### Puntos Clave

1. **CloudFront intercepta el error**: No deja que el 403/404 llegue al browser
2. **Sirve index.html con código 200**: El browser piensa que la ruta existe
3. **React Router toma control**: Lee la URL y renderiza el componente correcto
4. **URL se mantiene**: El usuario ve `/login` en la barra de direcciones

---

## 4. Errores Comunes y Cómo Evitarlos

### ❌ Error 1: Usar Redirects (301/302) en lugar de Rewrite

**Mal:**
```
403 → /index.html → HTTP 301 (Redirect)
```

**Problema**: El browser redirige a `/index.html`, cambiando la URL. React Router no puede leer la ruta original.

**Correcto:**
```
403 → /index.html → HTTP 200 (Rewrite)
```

**Resultado**: El browser mantiene la URL `/login`, React Router funciona correctamente.

---

### ❌ Error 2: Crear Carpetas Falsas en S3

**Mal:**
```
s3://bucket/
  ├── index.html
  ├── login/
  │   └── index.html  ← Copia de index.html
  ├── documents/
  │   └── index.html  ← Copia de index.html
```

**Problemas**:
- Duplicación innecesaria de archivos
- Difícil de mantener (múltiples copias de index.html)
- No funciona para rutas dinámicas (`/documents/:id`)
- Aumenta el tamaño del deployment

**Correcto:**
```
s3://bucket/
  ├── index.html       ← Solo este archivo
  ├── login.html       ← Páginas estáticas (opcional)
  ├── assets/
  │   ├── main.js
  │   └── styles.css
```

Usa Custom Error Responses en CloudFront, no carpetas falsas.

---

### ❌ Error 3: No Configurar Cache Correctamente

**Mal:**
```bash
# Mismo cache para todo
aws s3 sync out/ s3://bucket/ --cache-control "max-age=31536000"
```

**Problema**: `index.html` se cachea por 1 año. Los usuarios no ven actualizaciones.

**Correcto:**
```bash
# Assets con cache largo (tienen hash en el nombre)
aws s3 sync out/ s3://bucket/ \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" \
  --exclude "*.json"

# HTML con cache corto o sin cache
aws s3 sync out/ s3://bucket/ \
  --cache-control "public, max-age=0, must-revalidate" \
  --exclude "*" \
  --include "*.html" \
  --include "*.json"
```

---

### ❌ Error 4: Olvidar Invalidar CloudFront Cache

**Problema**: Después de deployment, los usuarios siguen viendo la versión antigua.

**Solución**: Siempre invalidar después de deployment:

```bash
aws cloudfront create-invalidation \
  --distribution-id E1WB95BQGR0YAT \
  --paths "/*"
```

**Nota**: Las primeras 1000 invalidaciones por mes son gratis. Después cuesta $0.005 por path.

---

### ❌ Error 5: Usar Bucket Público

**Mal:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::bucket/*"
  }]
}
```

**Problemas**:
- Cualquiera puede acceder directamente a S3 (bypass CloudFront)
- No puedes usar WAF, geo-restriction, o signed URLs
- Menos seguro

**Correcto**: Usar OAC (Origin Access Control)

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "cloudfront.amazonaws.com"
    },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::bucket/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DIST_ID"
      }
    }
  }]
}
```

---

## 5. Best Practices para Producción

### OAC con S3

✅ **Siempre usar OAC** (Origin Access Control), no OAI (legacy)

```bash
# Crear OAC
aws cloudfront create-origin-access-control \
  --origin-access-control-config \
    Name="oac-my-spa",\
    SigningProtocol=sigv4,\
    SigningBehavior=always,\
    OriginAccessControlOriginType=s3
```

✅ **Habilitar Block Public Access** en S3 (las 4 configuraciones)

```bash
aws s3api put-public-access-block \
  --bucket my-spa-bucket \
  --public-access-block-configuration \
    BlockPublicAcls=true,\
    IgnorePublicAcls=true,\
    BlockPublicPolicy=true,\
    RestrictPublicBuckets=true
```

---

### Cache Behavior

#### Para `index.html` y archivos HTML

```
Cache-Control: public, max-age=0, must-revalidate
```

**Por qué**: Siempre obtener la última versión, pero permitir revalidación.

#### Para Assets con Hash (main.abc123.js)

```
Cache-Control: public, max-age=31536000, immutable
```

**Por qué**: El hash cambia cuando el contenido cambia. Cache por 1 año es seguro.

#### Para Assets sin Hash (favicon.ico, robots.txt)

```
Cache-Control: public, max-age=86400
```

**Por qué**: Cache por 1 día, balance entre freshness y performance.

---

### CloudFront Settings

```yaml
ViewerProtocolPolicy: redirect-to-https  # Forzar HTTPS
Compress: true                           # Gzip/Brotli compression
HttpVersion: http2and3                   # HTTP/2 y HTTP/3
PriceClass: PriceClass_100              # Solo NA y Europa (más barato)
DefaultRootObject: index.html            # Servir index.html en /
```

---

### Deployment Workflow

```bash
#!/bin/bash
set -e

# 1. Build
npm run build

# 2. Deploy assets con cache largo
aws s3 sync out/ s3://my-spa-bucket/ \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" \
  --exclude "*.json"

# 3. Deploy HTML con cache corto
aws s3 sync out/ s3://my-spa-bucket/ \
  --cache-control "public, max-age=0, must-revalidate" \
  --exclude "*" \
  --include "*.html" \
  --include "*.json"

# 4. Invalidar CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1WB95BQGR0YAT \
  --paths "/*"

echo "✓ Deployment complete!"
```

---

### Cache Invalidation Strategy

**Opción 1: Invalidar todo** (simple, recomendado para SPAs pequeñas)

```bash
aws cloudfront create-invalidation \
  --distribution-id E1WB95BQGR0YAT \
  --paths "/*"
```

**Costo**: Gratis hasta 1000/mes, luego $0.005 por path.

**Opción 2: Invalidar solo HTML** (más eficiente)

```bash
aws cloudfront create-invalidation \
  --distribution-id E1WB95BQGR0YAT \
  --paths "/index.html" "/login.html" "/404.html"
```

**Por qué funciona**: Los assets tienen hash en el nombre, no necesitan invalidación.

---

## 6. Compatibilidad con Frameworks

### ✅ React (Create React App, Vite)

**Funciona perfectamente** con Custom Error Responses.

```javascript
// React Router
import { BrowserRouter, Routes, Route } from 'react-router-dom';

<BrowserRouter>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
    <Route path="/documents/:id" element={<Document />} />
  </Routes>
</BrowserRouter>
```

**Build output**: `index.html` + assets

---

### ✅ Next.js (Static Export)

**Funciona con configuración correcta**.

```typescript
// next.config.ts
const nextConfig = {
  output: 'export',  // Static export
  images: {
    unoptimized: true,
  },
};
```

**Build output**: 
- Sin `trailingSlash`: `index.html`, `login.html`, `about.html`
- Con `trailingSlash: true`: `index.html`, `login/index.html`, `about/index.html`

**Recomendación**: NO usar `trailingSlash: true` para simplificar routing.

---

### ✅ Vite

**Funciona perfectamente**.

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
});
```

**Build output**: `index.html` + assets

---

### ✅ Vue Router

**Funciona perfectamente**.

```javascript
// router/index.js
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/login', component: Login },
  ],
});
```

---

### ❌ NO Funciona: Server-Side Rendering (SSR)

Frameworks que requieren servidor:
- Next.js con SSR/ISR
- Nuxt.js con SSR
- SvelteKit con SSR

**Solución**: Usar AWS Amplify, Vercel, o Lambda@Edge para SSR.

---

## Verificación

### Checklist de Configuración

- [ ] S3 bucket privado (Block Public Access habilitado)
- [ ] OAC configurado en CloudFront
- [ ] Bucket policy permite solo CloudFront via OAC
- [ ] Custom Error Responses: 403 → /index.html (200)
- [ ] Custom Error Responses: 404 → /index.html (200)
- [ ] Default Root Object: index.html
- [ ] Viewer Protocol Policy: redirect-to-https
- [ ] Cache headers correctos (HTML: no-cache, Assets: 1 año)
- [ ] Invalidación de cache en deployment

### Pruebas

```bash
# 1. Verificar que la home carga
curl -I https://tu-dominio.com/

# 2. Verificar que rutas SPA funcionan
curl -I https://tu-dominio.com/login
# Debe retornar 200, no 403/404

# 3. Verificar que assets se cachean
curl -I https://tu-dominio.com/assets/main.abc123.js
# Debe tener Cache-Control: max-age=31536000

# 4. Verificar HTTPS redirect
curl -I http://tu-dominio.com/
# Debe retornar 301 o 302 a https://
```

---

## Resumen

1. **Custom Error Responses son la clave**: 403/404 → /index.html (200)
2. **No uses redirects**: Usa rewrites (código 200)
3. **No crees carpetas falsas**: Usa Custom Error Responses
4. **Cache correctamente**: HTML sin cache, assets con cache largo
5. **Invalida después de deployment**: Siempre
6. **Usa OAC, no bucket público**: Más seguro
7. **Funciona con React, Vite, Next.js static**: Todos compatibles

Esta configuración es production-ready y sigue las mejores prácticas de AWS.
