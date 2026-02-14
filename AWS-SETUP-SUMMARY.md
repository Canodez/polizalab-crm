# Resumen de Configuración AWS - PolizaLab MVP

## ✅ Recursos Creados Exitosamente

### 1. Amazon Cognito
- **User Pool ID**: `us-east-1_Q6BXG6CTj`
- **App Client ID**: `20fc4iknq837tjdk9gbtmvbfv9`
- **Configuración**:
  - Autenticación por email
  - Password mínimo 8 caracteres
  - Sin MFA (para MVP)
  - Recuperación por email

### 2. DynamoDB Tables
- **Tabla Users**
  - Partition Key: `userId` (String)
  - Billing Mode: PAY_PER_REQUEST
  - ARN: `arn:aws:dynamodb:us-east-1:584876396768:table/Users`

- **Tabla Policies**
  - Partition Key: `policyId` (String)
  - Global Secondary Index: `userId-index`
    - Partition Key: `userId`
    - Sort Key: `createdAt`
  - Billing Mode: PAY_PER_REQUEST
  - ARN: `arn:aws:dynamodb:us-east-1:584876396768:table/Policies`

### 3. S3 Bucket
- **Nombre**: `polizalab-documents-dev`
- **Región**: `us-east-1`
- **Configuración**:
  - ✅ Encriptación SSE-S3 habilitada
  - ✅ Acceso público bloqueado
  - ✅ CORS configurado para localhost:3000

## 📝 Variables de Entorno

El archivo `.env.local` ha sido creado con las siguientes variables:

```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_Q6BXG6CTj
NEXT_PUBLIC_COGNITO_CLIENT_ID=20fc4iknq837tjdk9gbtmvbfv9
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_S3_BUCKET_NAME=polizalab-documents-dev
NEXT_PUBLIC_AWS_REGION=us-east-1
```

## 🔄 Próximos Pasos

### 1. Crear Roles IAM para Lambda Functions

Necesitas crear 3 roles IAM:

#### a) PolizaLabAuthProfileLambdaRole
Permisos necesarios:
- `AWSLambdaBasicExecutionRole` (CloudWatch Logs)
- DynamoDB: `GetItem`, `PutItem`, `UpdateItem` en tabla `Users`
- S3: `PutObject`, `GetObject` en `polizalab-documents-dev/profiles/*`

#### b) PolizaLabPolicyLambdaRole
Permisos necesarios:
- `AWSLambdaBasicExecutionRole`
- DynamoDB: `GetItem`, `PutItem`, `UpdateItem`, `Query` en tabla `Policies` y su índice
- S3: `PutObject`, `GetObject` en `polizalab-documents-dev/policies/*`

#### c) PolizaLabDocProcessorLambdaRole
Permisos necesarios:
- `AWSLambdaBasicExecutionRole`
- DynamoDB: `PutItem` en tabla `Policies`
- S3: `GetObject` en `polizalab-documents-dev/policies/*`
- Textract: `AnalyzeDocument`

**Comando para crear rol (ejemplo):**
```bash
# 1. Crear archivo de política de confianza
# trust-policy.json:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}

# 2. Crear el rol
aws iam create-role \
  --role-name PolizaLabAuthProfileLambdaRole \
  --assume-role-policy-document file://trust-policy.json

# 3. Adjuntar política básica de Lambda
aws iam attach-role-policy \
  --role-name PolizaLabAuthProfileLambdaRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# 4. Crear y adjuntar política inline para DynamoDB y S3
# (ver docs/aws-infrastructure-setup.md para el JSON completo)
```

### 2. Crear y Desplegar Lambda Functions

Necesitas crear 4 funciones Lambda:
- `polizalab-auth-handler`
- `polizalab-profile-handler`
- `polizalab-policy-handler`
- `polizalab-document-processor`

**Pasos para cada función:**
```bash
# 1. Navegar al directorio de la función
cd lambda/auth-handler

# 2. Instalar dependencias
npm install

# 3. Compilar TypeScript
npm run build

# 4. Crear archivo ZIP
# (En Windows PowerShell)
Compress-Archive -Path * -DestinationPath function.zip -Force

# 5. Crear función Lambda
aws lambda create-function \
  --function-name polizalab-auth-handler \
  --runtime nodejs18.x \
  --role arn:aws:iam::584876396768:role/PolizaLabAuthProfileLambdaRole \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --environment Variables={DYNAMODB_USERS_TABLE=Users,AWS_REGION_CUSTOM=us-east-1} \
  --region us-east-1
```

### 3. Crear API Gateway HTTP API

```bash
# 1. Crear API
aws apigatewayv2 create-api \
  --name polizalab-api \
  --protocol-type HTTP \
  --region us-east-1

# 2. Crear autorizador Cognito
aws apigatewayv2 create-authorizer \
  --api-id YOUR_API_ID \
  --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --name cognito-authorizer \
  --jwt-configuration Audience=20fc4iknq837tjdk9gbtmvbfv9,Issuer=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Q6BXG6CTj \
  --region us-east-1

# 3. Crear integraciones y rutas
# (ver docs/aws-infrastructure-setup.md para detalles completos)
```

### 4. Configurar S3 Event Notification

```bash
# Crear notificación para disparar Lambda cuando se suba un archivo
aws s3api put-bucket-notification-configuration \
  --bucket polizalab-documents-dev \
  --notification-configuration file://s3-event-config.json
```

## 🧪 Verificar Configuración

### Verificar Cognito
```bash
aws cognito-idp describe-user-pool --user-pool-id us-east-1_Q6BXG6CTj --region us-east-1
```

### Verificar DynamoDB
```bash
aws dynamodb describe-table --table-name Users --region us-east-1
aws dynamodb describe-table --table-name Policies --region us-east-1
```

### Verificar S3
```bash
aws s3api get-bucket-cors --bucket polizalab-documents-dev
aws s3api get-bucket-encryption --bucket polizalab-documents-dev
```

## 📚 Documentación de Referencia

- **Guía completa**: `docs/aws-infrastructure-setup.md`
- **Scripts**: `scripts/README.md`
- **Diseño técnico**: `.kiro/specs/polizalab-mvp/design.md`

## ⚠️ Notas Importantes

1. **Costos**: Los recursos creados usan el tier gratuito cuando es posible, pero pueden generar costos:
   - DynamoDB: PAY_PER_REQUEST (cobra por operación)
   - S3: Cobra por almacenamiento y transferencia
   - Cognito: Primeros 50,000 usuarios gratis

2. **Seguridad**:
   - El bucket S3 tiene acceso público bloqueado ✅
   - Cognito requiere contraseñas seguras ✅
   - CORS solo permite localhost:3000 (actualizar para producción)

3. **Región**: Todos los recursos están en `us-east-1`

## 🗑️ Limpieza (Si necesitas eliminar recursos)

```bash
# Eliminar User Pool
aws cognito-idp delete-user-pool --user-pool-id us-east-1_Q6BXG6CTj --region us-east-1

# Eliminar tablas DynamoDB
aws dynamodb delete-table --table-name Users --region us-east-1
aws dynamodb delete-table --table-name Policies --region us-east-1

# Vaciar y eliminar bucket S3
aws s3 rm s3://polizalab-documents-dev --recursive
aws s3api delete-bucket --bucket polizalab-documents-dev --region us-east-1
```

---

**Fecha de creación**: 2026-02-14
**AWS Account ID**: 584876396768
**Región**: us-east-1
