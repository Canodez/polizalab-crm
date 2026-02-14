# Guía de Configuración Manual de AWS - PolizaLab MVP

Esta guía te llevará paso a paso para configurar los recursos AWS necesarios usando comandos individuales.

## Requisitos Previos

1. AWS CLI instalado y configurado
2. Ejecutar: `aws configure` con tus credenciales

## Verificar Configuración

```powershell
# Verificar que AWS CLI funciona
aws --version

# Verificar credenciales
aws sts get-caller-identity
```

Deberías ver tu Account ID y región.

---

## Paso 1: Crear Cognito User Pool

### Opción A: Consola AWS (Recomendado)

1. Ve a **AWS Console** → **Amazon Cognito**
2. Click **Create user pool**
3. Configuración:
   - Sign-in options: **Email**
   - Password policy: **Cognito defaults**
   - MFA: **No MFA**
   - User pool name: `polizalab-users`
   - App client name: `polizalab-web-client`
   - **NO generar client secret**
   - Auth flows: **ALLOW_USER_PASSWORD_AUTH** y **ALLOW_REFRESH_TOKEN_AUTH**

4. Anota estos valores:
   ```
   User Pool ID: us-east-1_XXXXXXXXX
   App Client ID: XXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

### Opción B: AWS CLI

```powershell
# Crear User Pool (comando largo, copia completo)
aws cognito-idp create-user-pool `
  --pool-name polizalab-users `
  --auto-verified-attributes email `
  --username-attributes email `
  --mfa-configuration OFF `
  --region us-east-1

# Anota el User Pool ID de la respuesta
# Ejemplo: "Id": "us-east-1_abc123XYZ"
```

Luego crea el App Client:

```powershell
# Reemplaza YOUR_USER_POOL_ID con el ID que obtuviste
aws cognito-idp create-user-pool-client `
  --user-pool-id YOUR_USER_POOL_ID `
  --client-name polizalab-web-client `
  --no-generate-secret `
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH `
  --region us-east-1

# Anota el Client ID de la respuesta
```

---

## Paso 2: Crear Tablas DynamoDB

### Tabla Users

```powershell
aws dynamodb create-table `
  --table-name Users `
  --attribute-definitions AttributeName=userId,AttributeType=S `
  --key-schema AttributeName=userId,KeyType=HASH `
  --billing-mode PAY_PER_REQUEST `
  --region us-east-1
```

Espera a que esté activa:

```powershell
aws dynamodb wait table-exists --table-name Users --region us-east-1
```

### Tabla Policies

```powershell
aws dynamodb create-table `
  --table-name Policies `
  --attribute-definitions `
    AttributeName=policyId,AttributeType=S `
    AttributeName=userId,AttributeType=S `
    AttributeName=createdAt,AttributeType=S `
  --key-schema AttributeName=policyId,KeyType=HASH `
  --global-secondary-indexes `
    IndexName=userId-index,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL} `
  --billing-mode PAY_PER_REQUEST `
  --region us-east-1
```

Espera a que esté activa:

```powershell
aws dynamodb wait table-exists --table-name Policies --region us-east-1
```

---

## Paso 3: Crear Bucket S3

```powershell
# Crear bucket
aws s3api create-bucket `
  --bucket polizalab-documents-dev `
  --region us-east-1

# Habilitar encriptación
aws s3api put-bucket-encryption `
  --bucket polizalab-documents-dev `
  --server-side-encryption-configuration '{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"AES256\"}}]}'

# Bloquear acceso público
aws s3api put-public-access-block `
  --bucket polizalab-documents-dev `
  --public-access-block-configuration `
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### Configurar CORS

Crea un archivo `cors-config.json`:

```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedOrigins": ["http://localhost:3000"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}
```

Aplica la configuración:

```powershell
aws s3api put-bucket-cors `
  --bucket polizalab-documents-dev `
  --cors-configuration file://cors-config.json
```

---

## Paso 4: Verificar Recursos Creados

```powershell
# Verificar Cognito
aws cognito-idp list-user-pools --max-results 10 --region us-east-1

# Verificar DynamoDB
aws dynamodb list-tables --region us-east-1

# Verificar S3
aws s3 ls
```

---

## Paso 5: Configurar Variables de Entorno

Crea o edita el archivo `.env.local` en la raíz del proyecto:

```bash
# Cognito
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_COGNITO_REGION=us-east-1

# S3
NEXT_PUBLIC_S3_BUCKET_NAME=polizalab-documents-dev
NEXT_PUBLIC_S3_REGION=us-east-1

# AWS
NEXT_PUBLIC_AWS_REGION=us-east-1

# API Gateway (lo configuraremos después)
NEXT_PUBLIC_API_GATEWAY_URL=https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com
```

Reemplaza los valores `XXXXXXXXX` con los IDs reales que obtuviste.

---

## Próximos Pasos

Ahora que tienes los recursos básicos:

1. **Crear Roles IAM** para las funciones Lambda
2. **Desplegar funciones Lambda** (auth-handler, profile-handler, etc.)
3. **Crear API Gateway** y configurar rutas
4. **Configurar S3 Event Notification** para el procesamiento de documentos

Consulta `docs/aws-infrastructure-setup.md` para instrucciones detalladas de estos pasos.

---

## Comandos Útiles

### Ver detalles de una tabla

```powershell
aws dynamodb describe-table --table-name Users --region us-east-1
aws dynamodb describe-table --table-name Policies --region us-east-1
```

### Ver configuración de bucket

```powershell
aws s3api get-bucket-cors --bucket polizalab-documents-dev
aws s3api get-bucket-encryption --bucket polizalab-documents-dev
```

### Listar items en DynamoDB (para testing)

```powershell
aws dynamodb scan --table-name Users --region us-east-1
aws dynamodb scan --table-name Policies --region us-east-1
```

---

## Solución de Problemas

### Error: "Bucket name already exists"

Los nombres de buckets S3 son únicos globalmente. Cambia el nombre:

```powershell
aws s3api create-bucket `
  --bucket polizalab-documents-dev-TU-NOMBRE `
  --region us-east-1
```

### Error: "Table already exists"

Si la tabla ya existe, puedes continuar. Verifica que tenga la configuración correcta:

```powershell
aws dynamodb describe-table --table-name Users --region us-east-1
```

### Error: "Access Denied"

Tu usuario AWS necesita permisos para:
- Cognito: `cognito-idp:*`
- DynamoDB: `dynamodb:*`
- S3: `s3:*`

Contacta a tu administrador AWS para obtener los permisos necesarios.

---

## Limpieza (Eliminar Recursos)

Si necesitas eliminar los recursos creados:

```powershell
# Eliminar User Pool
aws cognito-idp delete-user-pool --user-pool-id YOUR_USER_POOL_ID --region us-east-1

# Eliminar tablas
aws dynamodb delete-table --table-name Users --region us-east-1
aws dynamodb delete-table --table-name Policies --region us-east-1

# Vaciar y eliminar bucket
aws s3 rm s3://polizalab-documents-dev --recursive
aws s3api delete-bucket --bucket polizalab-documents-dev --region us-east-1
```

---

¡Listo! Ahora tienes la infraestructura básica de AWS configurada para PolizaLab MVP.
