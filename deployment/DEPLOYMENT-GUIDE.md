# PolizaLab CRM - Static Web Deployment Guide

Este proyecto usa el **static-web-deploy-power** de Kiro para deployment seguro en AWS.

## Arquitectura

```
Usuario (HTTPS) → CloudFront (CDN) → S3 Bucket (Privado)
                       ↓
                  Origin Access Control (OAC)
```

## Configuración

### Variables de Entorno

- **AWS Region**: us-east-1
- **AWS Account ID**: 584876396768
- **Frontend Bucket**: polizalab-crm-frontend
- **Build Output**: out/
- **Node Version**: 20

## Paso 1: Configurar Infraestructura

### Opción A: PowerShell (Windows)

```powershell
cd deployment
.\setup-infrastructure.ps1
```

### Opción B: Bash (Linux/Mac)

```bash
cd deployment
chmod +x setup-infrastructure.sh
./setup-infrastructure.sh
```

Este script:
- ✅ Crea el bucket S3 `polizalab-crm-frontend`
- ✅ Habilita versionado del bucket
- ✅ Bloquea acceso público (las 4 configuraciones)
- ✅ Crea Origin Access Control (OAC)

## Paso 2: Crear CloudFront Distribution

### Usando AWS Console

1. Ve a CloudFront Console: https://console.aws.amazon.com/cloudfront
2. Click **Create Distribution**
3. **Origin Settings**:
   - Origin domain: `polizalab-crm-frontend.s3.us-east-1.amazonaws.com`
   - Origin access: **Origin access control settings (recommended)**
   - Origin access control: Selecciona el OAC creado (`oac-polizalab-crm-frontend`)
   
4. **Default Cache Behavior**:
   - Viewer protocol policy: **Redirect HTTP to HTTPS**
   - Allowed HTTP methods: **GET, HEAD**
   - Cache policy: **CachingOptimized**
   
5. **Settings**:
   - Price class: **Use only North America and Europe**
   - Alternate domain name (CNAME): (opcional, si tienes dominio)
   - Custom SSL certificate: (opcional, si tienes dominio)
   - Default root object: `index.html`
   - Standard logging: **On** (opcional)
   
6. Click **Create Distribution**

7. **Importante**: Copia el **Distribution ID** (ej: E1234567890ABC)

### Usando AWS CLI

```bash
# Primero, obtén el OAC ID del paso anterior
OAC_ID="<tu-oac-id>"

# Crear distribución
aws cloudfront create-distribution \
  --origin-domain-name polizalab-crm-frontend.s3.us-east-1.amazonaws.com \
  --default-root-object index.html
```

## Paso 3: Configurar S3 Bucket Policy

Una vez que tengas el Distribution ID, actualiza la política del bucket:

```bash
# Reemplaza DISTRIBUTION_ID con tu ID real
DISTRIBUTION_ID="E1234567890ABC"

cat > bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontOACReadOnly",
    "Effect": "Allow",
    "Principal": {
      "Service": "cloudfront.amazonaws.com"
    },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::polizalab-crm-frontend/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::584876396768:distribution/$DISTRIBUTION_ID"
      }
    }
  }]
}
EOF

aws s3api put-bucket-policy \
  --bucket polizalab-crm-frontend \
  --policy file://bucket-policy.json
```

## Paso 4: Configurar CodeBuild

### Crear IAM Role para CodeBuild

```bash
# Crear trust policy
cat > codebuild-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "codebuild.amazonaws.com"
    },
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Crear role
aws iam create-role \
  --role-name PolizaLabCodeBuildRole \
  --assume-role-policy-document file://codebuild-trust-policy.json

# Crear policy con permisos mínimos
cat > codebuild-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::polizalab-crm-frontend",
        "arn:aws:s3:::polizalab-crm-frontend/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::584876396768:distribution/$DISTRIBUTION_ID"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:584876396768:log-group:/aws/codebuild/*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name PolizaLabCodeBuildRole \
  --policy-name CodeBuildPolicy \
  --policy-document file://codebuild-policy.json
```

### Crear CodeBuild Project

```bash
# Reemplaza con tu GitHub token
GITHUB_TOKEN="<tu-github-token>"

aws codebuild create-project \
  --name polizalab-crm-frontend \
  --source type=GITHUB,location=https://github.com/Canodez/polizalab-crm.git \
  --artifacts type=NO_ARTIFACTS \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_SMALL \
  --service-role arn:aws:iam::584876396768:role/PolizaLabCodeBuildRole \
  --environment-variables-override \
      name=FRONTEND_BUCKET_NAME,value=polizalab-crm-frontend \
      name=CLOUDFRONT_DISTRIBUTION_ID,value=$DISTRIBUTION_ID
```

## Paso 5: Deployment Manual (Primera vez)

```bash
# Build
npm run build

# Deploy to S3
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

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

## Paso 6: Configurar CI/CD Automático

### GitHub Actions (Recomendado)

Crea `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

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
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Deploy to S3
        run: |
          aws s3 sync out/ s3://polizalab-crm-frontend/ --delete
          
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

## Verificación

1. **S3 Bucket**: https://s3.console.aws.amazon.com/s3/buckets/polizalab-crm-frontend
2. **CloudFront**: https://console.aws.amazon.com/cloudfront
3. **Tu sitio**: https://[distribution-id].cloudfront.net

## Troubleshooting

### Error: AccessDenied al acceder al sitio

- Verifica que la bucket policy esté configurada correctamente
- Verifica que el Distribution ID en la policy sea correcto
- Verifica que el OAC esté asociado a la distribución

### Contenido desactualizado (cache)

```bash
# Invalidar todo el cache
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

### Build falla

- Verifica que `output: 'export'` esté en `next.config.ts`
- Verifica que no uses features no soportadas en static export (API routes, ISR, etc.)

## Seguridad

✅ Bucket S3 privado (Block Public Access habilitado)
✅ Solo CloudFront puede acceder al bucket (OAC)
✅ HTTPS obligatorio (redirect HTTP to HTTPS)
✅ TLS 1.2 mínimo
✅ IAM role con permisos mínimos (least privilege)
✅ No hay credenciales en el código

## Recursos

- [Static Web Deploy Power Documentation](https://github.com/kiro-ai/powers/tree/main/static-web-deploy-power)
- [Next.js Static Export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [CloudFront OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
