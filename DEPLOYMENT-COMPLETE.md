# 🎉 Despliegue Completo - PolizaLab MVP

## ✅ Infraestructura AWS Configurada

### 1. Amazon Cognito
- **User Pool ID**: `us-east-1_Q6BXG6CTj`
- **App Client ID**: `20fc4iknq837tjdk9gbtmvbfv9`
- **Región**: `us-east-1`
- **Configuración**: Email authentication, password policy, recovery by email

### 2. DynamoDB Tables
- **Users Table**: 
  - ARN: `arn:aws:dynamodb:us-east-1:584876396768:table/Users`
  - Partition Key: `userId`
  - Billing: PAY_PER_REQUEST

- **Policies Table**:
  - ARN: `arn:aws:dynamodb:us-east-1:584876396768:table/Policies`
  - Partition Key: `policyId`
  - GSI: `userId-index` (userId + createdAt)
  - Billing: PAY_PER_REQUEST

### 3. S3 Bucket
- **Nombre**: `polizalab-documents-dev`
- **Región**: `us-east-1`
- **Características**:
  - ✅ Encriptación SSE-S3
  - ✅ Acceso público bloqueado
  - ✅ CORS configurado para localhost:3000

### 4. IAM Roles
- **PolizaLabAuthProfileLambdaRole**:
  - ARN: `arn:aws:iam::584876396768:role/PolizaLabAuthProfileLambdaRole`
  - Permisos:
    - CloudWatch Logs (AWSLambdaBasicExecutionRole)
    - DynamoDB: GetItem, PutItem, UpdateItem en tabla Users
    - S3: PutObject, GetObject en profiles/*

### 5. Lambda Functions
- **polizalab-auth-handler**:
  - ARN: `arn:aws:lambda:us-east-1:584876396768:function:polizalab-auth-handler`
  - Runtime: Python 3.12
  - Handler: `auth_handler.lambda_handler`
  - Timeout: 30 segundos
  - Endpoints: POST /auth/register

- **polizalab-profile-handler**:
  - ARN: `arn:aws:lambda:us-east-1:584876396768:function:polizalab-profile-handler`
  - Runtime: Python 3.12
  - Handler: `profile_handler.lambda_handler`
  - Timeout: 30 segundos
  - Endpoints: GET /profile, PUT /profile, POST /profile/image

### 6. API Gateway HTTP API
- **API ID**: `f34orvshp5`
- **Endpoint**: `https://f34orvshp5.execute-api.us-east-1.amazonaws.com`
- **Authorizer ID**: `81fo73` (Cognito JWT)
- **CORS**: Configurado para localhost:3000

**Rutas Configuradas**:
| Método | Ruta | Autenticación | Lambda |
|--------|------|---------------|--------|
| POST | /auth/register | No | polizalab-auth-handler |
| GET | /profile | Sí (JWT) | polizalab-profile-handler |
| PUT | /profile | Sí (JWT) | polizalab-profile-handler |
| POST | /profile/image | Sí (JWT) | polizalab-profile-handler |

## 🚀 Aplicación Frontend

### Variables de Entorno (.env.local)
```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_Q6BXG6CTj
NEXT_PUBLIC_COGNITO_CLIENT_ID=20fc4iknq837tjdk9gbtmvbfv9
NEXT_PUBLIC_COGNITO_REGION=us-east-1
NEXT_PUBLIC_S3_BUCKET_NAME=polizalab-documents-dev
NEXT_PUBLIC_AWS_REGION=us-east-1
NEXT_PUBLIC_API_GATEWAY_URL=https://f34orvshp5.execute-api.us-east-1.amazonaws.com
```

### Servidor de Desarrollo
- **URL**: http://localhost:3000
- **Estado**: ✅ Corriendo

## 🧪 Funcionalidad Disponible

### ✅ Completamente Funcional:
1. **Registro de Usuarios** (`/register`)
   - Crear cuenta con email y contraseña
   - Validación de Cognito
   - Creación automática de registro en DynamoDB

2. **Login** (`/login`)
   - Autenticación con Cognito
   - Obtención de tokens JWT
   - Redirección a home

3. **Perfil de Usuario** (`/profile`)
   - Ver datos del perfil
   - Editar nombre y apellido
   - Subir imagen de perfil a S3
   - Actualización en DynamoDB

### ⏳ Pendiente de Implementar:
1. **Gestión de Pólizas**
   - Subir documentos
   - Procesamiento con Textract
   - Listado de pólizas
   - Edición de pólizas
   - Vista de renovaciones

2. **Lambda Functions Adicionales**
   - Policy Handler (para gestión de pólizas)
   - Document Processor (para Textract)

## 📝 Cómo Probar

### 1. Registro de Usuario
```bash
# Abre el navegador en:
http://localhost:3000/register

# Registra un usuario:
Email: tu-email@example.com
Password: Test1234 (mínimo 8 caracteres, mayúsculas, minúsculas, números)
```

### 2. Verificar Email
Cognito enviará un código de verificación a tu email. Verifica tu cuenta.

### 3. Login
```bash
# Abre:
http://localhost:3000/login

# Inicia sesión con tus credenciales
```

### 4. Ver y Editar Perfil
```bash
# Abre:
http://localhost:3000/profile

# Podrás:
- Ver tu email
- Editar nombre y apellido
- Subir una foto de perfil
```

## 🔍 Verificar en AWS Console

### Cognito
```bash
# Ver usuarios registrados
https://console.aws.amazon.com/cognito/v2/idp/user-pools/us-east-1_Q6BXG6CTj/users
```

### DynamoDB
```bash
# Ver registros en tabla Users
https://console.aws.amazon.com/dynamodbv2/home?region=us-east-1#table?name=Users

# Ver registros en tabla Policies
https://console.aws.amazon.com/dynamodbv2/home?region=us-east-1#table?name=Policies
```

### S3
```bash
# Ver archivos subidos
https://s3.console.aws.amazon.com/s3/buckets/polizalab-documents-dev
```

### Lambda
```bash
# Ver logs de funciones
https://console.aws.amazon.com/lambda/home?region=us-east-1#/functions
```

### API Gateway
```bash
# Ver configuración del API
https://console.aws.amazon.com/apigateway/main/apis/f34orvshp5/routes?api=f34orvshp5&region=us-east-1
```

## 🐛 Debugging

### Ver Logs de Lambda
```bash
# Auth Handler
aws logs tail /aws/lambda/polizalab-auth-handler --follow --region us-east-1

# Profile Handler
aws logs tail /aws/lambda/polizalab-profile-handler --follow --region us-east-1
```

### Probar API Directamente
```bash
# Registrar usuario (sin auth)
curl -X POST https://f34orvshp5.execute-api.us-east-1.amazonaws.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"cognitoUserId":"test-123","email":"test@example.com"}'

# Ver perfil (con auth - necesitas un token JWT)
curl -X GET https://f34orvshp5.execute-api.us-east-1.amazonaws.com/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 💰 Costos Estimados

Con el uso del MVP (desarrollo):
- **Cognito**: Gratis (primeros 50,000 usuarios)
- **DynamoDB**: ~$0.25/mes (PAY_PER_REQUEST con poco tráfico)
- **S3**: ~$0.50/mes (pocos archivos)
- **Lambda**: Gratis (dentro del tier gratuito)
- **API Gateway**: ~$1/mes (pocas llamadas)

**Total estimado**: ~$2-3/mes durante desarrollo

## 🎯 Próximos Pasos

Para completar el MVP:

1. **Implementar Policy Handler Lambda**
   - Crear función para gestión de pólizas
   - Agregar rutas al API Gateway

2. **Implementar Document Processor Lambda**
   - Integrar con AWS Textract
   - Configurar S3 Event Notification
   - Parsear datos extraídos

3. **Crear UI para Pólizas**
   - Página de subida de documentos
   - Lista de pólizas
   - Vista de renovaciones
   - Edición de pólizas

4. **Testing End-to-End**
   - Probar flujo completo
   - Ajustar según necesidades

## 📚 Documentación de Referencia

- **Guía de Setup**: `AWS-SETUP-SUMMARY.md`
- **Código Lambda**: `lambda-deploy/`
- **Diseño Técnico**: `.kiro/specs/polizalab-mvp/design.md`
- **Tareas Pendientes**: `.kiro/specs/polizalab-mvp/tasks.md`

---

**Fecha de Despliegue**: 2026-02-14
**AWS Account**: 584876396768
**Región**: us-east-1
**Estado**: ✅ Funcional para Registro, Login y Perfil
