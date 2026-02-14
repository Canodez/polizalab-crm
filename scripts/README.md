# Scripts de Configuración de AWS

Este directorio contiene scripts para automatizar la configuración de la infraestructura AWS de PolizaLab MVP.

## Requisitos Previos

1. **AWS CLI instalado**
   - Windows: Descargar desde https://aws.amazon.com/cli/
   - Mac/Linux: `brew install awscli` o seguir la guía oficial

2. **Credenciales AWS configuradas**
   ```bash
   aws configure
   ```
   Necesitarás:
   - AWS Access Key ID
   - AWS Secret Access Key
   - Región por defecto: `us-east-1`
   - Formato de salida: `json`

3. **Permisos necesarios**
   Tu usuario AWS debe tener permisos para crear:
   - Cognito User Pools
   - DynamoDB Tables
   - S3 Buckets
   - IAM Roles (para Lambda)
   - Lambda Functions
   - API Gateway

## Scripts Disponibles

### 1. setup-aws-infrastructure.ps1 (Windows PowerShell)

Script automatizado para crear los recursos básicos de AWS.

**Uso:**
```powershell
cd scripts
.\setup-aws-infrastructure.ps1
```

**Qué crea:**
- ✅ Cognito User Pool con autenticación por email
- ✅ Cognito App Client (sin client secret)
- ✅ DynamoDB tabla Users
- ✅ DynamoDB tabla Policies con índice userId-index
- ✅ S3 Bucket con encriptación y CORS configurado

**Salida:**
El script mostrará las variables de entorno que necesitas copiar a tu archivo `.env.local`.

### 2. setup-aws-infrastructure.sh (Mac/Linux Bash)

Versión del script para sistemas Unix.

**Uso:**
```bash
cd scripts
chmod +x setup-aws-infrastructure.sh
./setup-aws-infrastructure.sh
```

## Pasos Después de Ejecutar el Script

### 1. Configurar Variables de Entorno

Copia las variables que el script imprimió al final a tu archivo `.env.local`:

```bash
# .env.local
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_S3_BUCKET_NAME=polizalab-documents-dev
NEXT_PUBLIC_AWS_REGION=us-east-1
NEXT_PUBLIC_API_GATEWAY_URL=https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com
```

### 2. Crear Roles IAM para Lambda

Los roles IAM requieren permisos específicos y es mejor crearlos manualmente o con un script separado.

**Opción A: Consola AWS (Recomendado para MVP)**

Sigue la guía detallada en `docs/aws-infrastructure-setup.md` sección 4.

**Opción B: AWS CLI**

```bash
# Crear rol para Auth y Profile Lambdas
aws iam create-role \
  --role-name PolizaLabAuthProfileLambdaRole \
  --assume-role-policy-document file://iam-policies/lambda-trust-policy.json

# Adjuntar políticas
aws iam attach-role-policy \
  --role-name PolizaLabAuthProfileLambdaRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Crear política inline para DynamoDB y S3
aws iam put-role-policy \
  --role-name PolizaLabAuthProfileLambdaRole \
  --policy-name DynamoDBAndS3Access \
  --policy-document file://iam-policies/auth-profile-policy.json
```

### 3. Crear y Desplegar Lambda Functions

```bash
# Navegar a cada directorio de Lambda
cd lambda/auth-handler
npm install
npm run build

# Crear archivo ZIP
zip -r function.zip .

# Crear función Lambda
aws lambda create-function \
  --function-name polizalab-auth-handler \
  --runtime nodejs18.x \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/PolizaLabAuthProfileLambdaRole \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --environment Variables={DYNAMODB_USERS_TABLE=Users,AWS_REGION_CUSTOM=us-east-1}
```

Repite para cada función Lambda:
- `polizalab-auth-handler`
- `polizalab-profile-handler`
- `polizalab-policy-handler`
- `polizalab-document-processor`

### 4. Crear API Gateway

**Opción A: Consola AWS (Recomendado)**

Sigue la guía en `docs/aws-infrastructure-setup.md` sección 7.

**Opción B: AWS CLI**

```bash
# Crear HTTP API
aws apigatewayv2 create-api \
  --name polizalab-api \
  --protocol-type HTTP \
  --target arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:function:polizalab-auth-handler

# Crear autorizador Cognito
aws apigatewayv2 create-authorizer \
  --api-id YOUR_API_ID \
  --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --name cognito-authorizer \
  --jwt-configuration Audience=YOUR_CLIENT_ID,Issuer=https://cognito-idp.us-east-1.amazonaws.com/YOUR_USER_POOL_ID
```

### 5. Configurar S3 Event Notification

```bash
# Crear notificación de evento S3 para Lambda
aws s3api put-bucket-notification-configuration \
  --bucket polizalab-documents-dev \
  --notification-configuration file://s3-event-config.json
```

Contenido de `s3-event-config.json`:
```json
{
  "LambdaFunctionConfigurations": [
    {
      "LambdaFunctionArn": "arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:function:polizalab-document-processor",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "prefix",
              "Value": "policies/"
            }
          ]
        }
      }
    }
  ]
}
```

## Verificación

### Verificar Cognito
```bash
aws cognito-idp list-user-pools --max-results 10
```

### Verificar DynamoDB
```bash
aws dynamodb list-tables
aws dynamodb describe-table --table-name Users
aws dynamodb describe-table --table-name Policies
```

### Verificar S3
```bash
aws s3 ls
aws s3api get-bucket-cors --bucket polizalab-documents-dev
```

### Verificar Lambda
```bash
aws lambda list-functions
```

### Verificar API Gateway
```bash
aws apigatewayv2 get-apis
```

## Limpieza (Eliminar Recursos)

⚠️ **CUIDADO**: Esto eliminará todos los recursos creados.

```bash
# Eliminar User Pool
aws cognito-idp delete-user-pool --user-pool-id YOUR_USER_POOL_ID

# Eliminar tablas DynamoDB
aws dynamodb delete-table --table-name Users
aws dynamodb delete-table --table-name Policies

# Eliminar bucket S3 (primero vaciar)
aws s3 rm s3://polizalab-documents-dev --recursive
aws s3api delete-bucket --bucket polizalab-documents-dev

# Eliminar funciones Lambda
aws lambda delete-function --function-name polizalab-auth-handler
aws lambda delete-function --function-name polizalab-profile-handler
aws lambda delete-function --function-name polizalab-policy-handler
aws lambda delete-function --function-name polizalab-document-processor

# Eliminar API Gateway
aws apigatewayv2 delete-api --api-id YOUR_API_ID

# Eliminar roles IAM
aws iam delete-role --role-name PolizaLabAuthProfileLambdaRole
aws iam delete-role --role-name PolizaLabPolicyLambdaRole
aws iam delete-role --role-name PolizaLabDocProcessorLambdaRole
```

## Solución de Problemas

### Error: "AWS CLI not found"
- Instala AWS CLI siguiendo la guía oficial
- Reinicia tu terminal después de la instalación

### Error: "Credentials not configured"
- Ejecuta `aws configure`
- Verifica que tienes Access Key ID y Secret Access Key válidos

### Error: "Access Denied"
- Verifica que tu usuario AWS tiene los permisos necesarios
- Contacta a tu administrador AWS para solicitar permisos

### Error: "Bucket name already exists"
- Los nombres de buckets S3 deben ser únicos globalmente
- Modifica la variable `BUCKET_NAME` en el script con un nombre único

### Error: "Table already exists"
- Si las tablas ya existen, el script continuará
- Verifica que las tablas tienen la configuración correcta

## Recursos Adicionales

- [Documentación AWS CLI](https://docs.aws.amazon.com/cli/)
- [Guía de Cognito](https://docs.aws.amazon.com/cognito/)
- [Guía de DynamoDB](https://docs.aws.amazon.com/dynamodb/)
- [Guía de Lambda](https://docs.aws.amazon.com/lambda/)
- [Guía de API Gateway](https://docs.aws.amazon.com/apigateway/)

## Soporte

Para más detalles sobre la arquitectura y configuración manual, consulta:
- `docs/aws-infrastructure-setup.md` - Guía completa paso a paso
- `.kiro/specs/polizalab-mvp/design.md` - Documento de diseño técnico
