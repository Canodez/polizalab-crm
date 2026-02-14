# PolizaLab CRM - Setup Completo

## ✅ Infraestructura Creada

### S3 Bucket
- **Nombre**: `polizalab-crm-frontend`
- **Región**: us-east-1
- **Versionado**: Habilitado
- **Acceso Público**: Bloqueado (las 4 configuraciones)
- **Política**: Configurada para CloudFront OAI

### Origin Access Identity (OAI)
- **ID**: `E3BQAXQSBU23OZ`
- **Tipo**: CloudFront Origin Access Identity (legacy, pero funcional)
- **Nota**: Cuando actualices AWS CLI v2, podrás migrar a OAC (recomendado)

### Next.js Configuration
- **Output**: Static export habilitado
- **Build directory**: `out/`
- **Images**: Unoptimized (requerido para static export)

## 📋 Próximos Pasos

### 1. Crear CloudFront Distribution

Ve a la consola de CloudFront: https://console.aws.amazon.com/cloudfront

**Configuración recomendada:**

#### Origin Settings
- **Origin domain**: `polizalab-crm-frontend.s3.us-east-1.amazonaws.com`
- **Origin access**: Restrict access to S3 bucket
- **Origin access identity**: Selecciona `E3BQAXQSBU23OZ`

#### Default Cache Behavior
- **Viewer protocol policy**: Redirect HTTP to HTTPS
- **Allowed HTTP methods**: GET, HEAD
- **Cache policy**: CachingOptimized

#### Distribution Settings
- **Price class**: Use only North America and Europe
- **Default root object**: `index.html`
- **Logging**: On (opcional)

### 2. Configurar Error Pages para SPA

Después de crear la distribución, configura custom error responses:

1. Ve a la pestaña "Error Pages"
2. Crea dos custom error responses:

**Error 403:**
- HTTP Error Code: 403
- Customize Error Response: Yes
- Response Page Path: `/index.html`
- HTTP Response Code: 200

**Error 404:**
- HTTP Error Code: 404
- Customize Error Response: Yes
- Response Page Path: `/index.html`
- HTTP Response Code: 200

Esto permite que el routing de Next.js funcione correctamente.

### 3. Primer Deployment Manual

```bash
# Build
npm run build

# Deploy
aws s3 sync out/ s3://polizalab-crm-frontend/ --delete

# Obtén el CloudFront Distribution ID de la consola
# Luego invalida el cache
aws cloudfront create-invalidation --distribution-id <TU-DISTRIBUTION-ID> --paths "/*"
```

### 4. Configurar CI/CD con GitHub Actions

Crea `.github/workflows/deploy.yml`:

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main, master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Deploy to S3
        run: |
          aws s3 sync out/ s3://polizalab-crm-frontend/ \
            --delete \
            --cache-control "public, max-age=31536000, immutable" \
            --exclude "*.html" \
            --exclude "*.json"
          
          aws s3 sync out/ s3://polizalab-crm-frontend/ \
            --cache-control "public, max-age=0, must-revalidate" \
            --exclude "*" \
            --include "*.html" \
            --include "*.json"
          
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id \${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

**GitHub Secrets necesarios:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `CLOUDFRONT_DISTRIBUTION_ID`

### 5. Actualizar Variables de Entorno

Después de crear la distribución de CloudFront, actualiza tu `.env.local`:

```env
# Existing variables...

# CloudFront Distribution
NEXT_PUBLIC_CLOUDFRONT_URL=https://<distribution-id>.cloudfront.net
```

## 🔒 Seguridad Implementada

✅ S3 bucket privado (no acceso público directo)
✅ Solo CloudFront puede acceder al bucket (via OAI)
✅ HTTPS obligatorio
✅ Versionado habilitado (rollback capability)
✅ Bucket policy con permisos mínimos

## 📊 Monitoreo

### Ver archivos en S3
```bash
aws s3 ls s3://polizalab-crm-frontend/ --recursive
```

### Ver distribuciones de CloudFront
```bash
aws cloudfront list-distributions
```

### Ver invalidaciones
```bash
aws cloudfront list-invalidations --distribution-id <DISTRIBUTION-ID>
```

## 🔄 Migración Futura a OAC

Cuando actualices AWS CLI a v2, podrás migrar de OAI a OAC:

1. Actualizar AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
2. Crear OAC: `aws cloudfront create-origin-access-control`
3. Actualizar distribución para usar OAC
4. Actualizar bucket policy con formato OAC
5. Eliminar OAI antiguo

## 📚 Recursos

- [Deployment Guide](./DEPLOYMENT-GUIDE.md) - Guía completa de deployment
- [Next.js Static Export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [CloudFront + S3](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)

## 🆘 Troubleshooting

### Error: AccessDenied al acceder al sitio
- Verifica que la bucket policy esté correcta
- Verifica que el OAI esté asociado a la distribución

### Contenido desactualizado
```bash
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

### Build falla
- Verifica que no uses API routes (no soportadas en static export)
- Verifica que no uses ISR o SSR
- Verifica que las imágenes estén configuradas como `unoptimized: true`
