# PolizaLab CRM - Static Web Deploy Setup Summary

## 🎉 ¡Configuración Completada!

Has configurado exitosamente el deployment estático de tu aplicación Next.js usando el **static-web-deploy-power** de Kiro.

## ✅ Lo que se ha configurado

### 1. Repositorio GitHub
- **URL**: https://github.com/Canodez/polizalab-crm
- **Branch**: master
- **Estado**: Código pusheado exitosamente

### 2. Next.js Static Export
- ✅ `output: 'export'` configurado en `next.config.ts`
- ✅ Imágenes configuradas como `unoptimized: true`
- ✅ `trailingSlash: true` para mejor compatibilidad con S3

### 3. AWS S3 Bucket
- **Nombre**: `polizalab-crm-frontend`
- **Región**: us-east-1
- **Versionado**: ✅ Habilitado
- **Acceso Público**: ✅ Bloqueado (las 4 configuraciones)
- **Bucket Policy**: ✅ Configurada para CloudFront OAI

### 4. CloudFront Origin Access Identity
- **ID**: `E3BQAXQSBU23OZ`
- **Tipo**: OAI (legacy, pero funcional)
- **Estado**: ✅ Creado y configurado en bucket policy

### 5. Archivos de Deployment
- ✅ `buildspec.yml` - Para AWS CodeBuild
- ✅ `deployment/setup-infrastructure.ps1` - Script de setup para Windows
- ✅ `deployment/setup-infrastructure.sh` - Script de setup para Linux/Mac
- ✅ `deployment/DEPLOYMENT-GUIDE.md` - Guía completa de deployment
- ✅ `deployment/SETUP-COMPLETE.md` - Próximos pasos detallados

## 📋 Próximos Pasos (IMPORTANTE)

### Paso 1: Crear CloudFront Distribution

Ve a: https://console.aws.amazon.com/cloudfront/v3/home#/distributions/create

**Configuración mínima requerida:**

1. **Origin domain**: `polizalab-crm-frontend.s3.us-east-1.amazonaws.com`
2. **Origin access**: Restrict access to S3 bucket
3. **Origin access identity**: Selecciona `E3BQAXQSBU23OZ`
4. **Viewer protocol policy**: Redirect HTTP to HTTPS
5. **Default root object**: `index.html`

Haz clic en "Create Distribution" y espera ~15 minutos a que se despliegue.

### Paso 2: Configurar Error Pages (Para SPA Routing)

Una vez creada la distribución:

1. Ve a la pestaña "Error Pages"
2. Crea custom error response para 403:
   - Response Page Path: `/index.html`
   - HTTP Response Code: 200
3. Crea custom error response para 404:
   - Response Page Path: `/index.html`
   - HTTP Response Code: 200

### Paso 3: Primer Deployment

```bash
# Build
npm run build

# Deploy
aws s3 sync out/ s3://polizalab-crm-frontend/ --delete

# Invalidate cache (reemplaza <DISTRIBUTION-ID>)
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION-ID> --paths "/*"
```

### Paso 4: Configurar CI/CD (Opcional pero Recomendado)

Crea `.github/workflows/deploy.yml` para deployment automático en cada push.

Ver ejemplo completo en: `deployment/DEPLOYMENT-GUIDE.md`

## 🔗 URLs Importantes

- **Repositorio**: https://github.com/Canodez/polizalab-crm
- **S3 Console**: https://s3.console.aws.amazon.com/s3/buckets/polizalab-crm-frontend
- **CloudFront Console**: https://console.aws.amazon.com/cloudfront
- **Tu sitio**: https://[distribution-id].cloudfront.net (después de crear la distribución)

## 📚 Documentación

- `deployment/SETUP-COMPLETE.md` - Próximos pasos detallados
- `deployment/DEPLOYMENT-GUIDE.md` - Guía completa de deployment
- `buildspec.yml` - Configuración de CodeBuild

## 🔒 Seguridad

✅ S3 bucket privado (no acceso público)
✅ Solo CloudFront puede acceder (via OAI)
✅ HTTPS obligatorio
✅ Versionado habilitado
✅ Permisos mínimos (least privilege)

## 💡 Consejos

1. **Dominio personalizado**: Puedes configurar un dominio personalizado en CloudFront después
2. **Cache**: Los archivos HTML tienen cache corto, los assets tienen cache largo (1 año)
3. **Invalidación**: Usa invalidaciones de CloudFront solo cuando sea necesario (tienen costo después de 1000/mes)
4. **Monitoreo**: Habilita CloudWatch metrics en CloudFront para monitorear tráfico

## 🆘 ¿Necesitas Ayuda?

- Revisa `deployment/DEPLOYMENT-GUIDE.md` para troubleshooting
- Verifica que el OAI esté correctamente asociado a la distribución
- Asegúrate de que la bucket policy esté aplicada

## 🎯 Siguiente Acción

**Crea la distribución de CloudFront ahora**: https://console.aws.amazon.com/cloudfront/v3/home#/distributions/create

Una vez creada, tendrás tu aplicación Next.js desplegada de forma segura y escalable en AWS! 🚀
