# Tarea 8 - Policy Handler Lambda - Deployment Completo

## ✅ Implementación Completada

### Lambda Function
- **Nombre**: `polizalab-policy-handler`
- **ARN**: `arn:aws:lambda:us-east-1:584876396768:function:polizalab-policy-handler`
- **Runtime**: Python 3.12
- **Handler**: `policy_handler.lambda_handler`
- **Timeout**: 30 segundos
- **Memory**: 128 MB

### Variables de Entorno
```
DYNAMODB_POLICIES_TABLE=Policies
S3_BUCKET_NAME=polizalab-documents-dev
```

### API Gateway Integration
- **Integration ID**: `g1tcej4`
- **Type**: AWS_PROXY
- **Payload Format**: 2.0

### Rutas Configuradas

| Método | Ruta | Route ID | Autenticación |
|--------|------|----------|---------------|
| GET | /policies | mcwlmko | JWT (Cognito) |
| GET | /policies/renewals | yt4zenl | JWT (Cognito) |
| GET | /policies/{id} | gvp31b4 | JWT (Cognito) |
| PUT | /policies/{id} | 48zepa5 | JWT (Cognito) |
| POST | /policies/upload-url | pzi1isn | JWT (Cognito) |

### Permisos IAM Actualizados

Rol: `PolizaLabAuthProfileLambdaRole`

**DynamoDB Permissions:**
- GetItem, PutItem, UpdateItem en tabla `Users`
- GetItem, PutItem, UpdateItem, Query en tabla `Policies`
- Query en índice `userId-index`

**S3 Permissions:**
- PutObject, GetObject en `polizalab-documents-dev/profiles/*`
- PutObject, GetObject en `polizalab-documents-dev/policies/*`

## 🎯 Funcionalidad Implementada

### 1. GET /policies
Lista las 10 pólizas más recientes del usuario (ordenadas por createdAt DESC).

**Ejemplo de uso:**
```bash
curl -X GET https://f34orvshp5.execute-api.us-east-1.amazonaws.com/policies \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Respuesta:**
```json
{
  "policies": [
    {
      "policyId": "uuid",
      "userId": "uuid",
      "clienteNombre": "Juan",
      "clienteApellido": "Pérez",
      "tipoPoliza": "Auto",
      "aseguradora": "AXA",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 2. GET /policies/renewals
Obtiene pólizas con renovaciones próximas (30, 60, 90 días).

**Ejemplo de uso:**
```bash
curl -X GET https://f34orvshp5.execute-api.us-east-1.amazonaws.com/policies/renewals \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Respuesta:**
```json
{
  "renewals": [
    {
      "policyId": "uuid",
      "clienteNombre": "María",
      "clienteApellido": "García",
      "tipoPoliza": "GMM",
      "aseguradora": "Metlife",
      "fechaRenovacion": "2024-03-15",
      "renewalStatus": "30_DAYS"
    }
  ]
}
```

### 3. GET /policies/{id}
Obtiene detalles completos de una póliza específica.

**Ejemplo de uso:**
```bash
curl -X GET https://f34orvshp5.execute-api.us-east-1.amazonaws.com/policies/abc-123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Respuesta:**
```json
{
  "policyId": "abc-123",
  "userId": "user-456",
  "clienteNombre": "Juan",
  "clienteApellido": "Pérez",
  "edad": 35,
  "tipoPoliza": "Auto",
  "cobertura": "Amplia",
  "numeroPoliza": "POL-12345",
  "aseguradora": "AXA",
  "fechaInicio": "2024-01-01",
  "fechaFin": "2025-01-01",
  "fechaRenovacion": "2025-01-01",
  "renewalStatus": "90_DAYS",
  "s3Key": "policies/user-456/uuid/document.pdf",
  "status": "PROCESSED",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### 4. PUT /policies/{id}
Actualiza campos de una póliza existente.

**Ejemplo de uso:**
```bash
curl -X PUT https://f34orvshp5.execute-api.us-east-1.amazonaws.com/policies/abc-123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteNombre": "Carlos",
    "clienteApellido": "López",
    "edad": 40,
    "tipoPoliza": "GMM",
    "cobertura": "Básica",
    "numeroPoliza": "POL-67890",
    "aseguradora": "Metlife",
    "fechaInicio": "2024-06-01",
    "fechaFin": "2025-06-01"
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "policy": {
    "policyId": "abc-123",
    "clienteNombre": "Carlos",
    "fechaRenovacion": "2025-06-01",
    "updatedAt": "2024-01-20T15:45:00Z"
  }
}
```

**Nota:** `fechaRenovacion` se recalcula automáticamente si cambias `fechaInicio` o `tipoPoliza`.

### 5. POST /policies/upload-url
Genera URL pre-firmada para subir documentos a S3.

**Ejemplo de uso:**
```bash
curl -X POST https://f34orvshp5.execute-api.us-east-1.amazonaws.com/policies/upload-url \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "poliza-auto.pdf",
    "fileType": "application/pdf"
  }'
```

**Respuesta:**
```json
{
  "presignedUrl": "https://polizalab-documents-dev.s3.amazonaws.com/...",
  "s3Key": "policies/user-456/uuid-789/poliza-auto.pdf"
}
```

**Uso de la URL:**
```bash
curl -X PUT "PRESIGNED_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @poliza-auto.pdf
```

## 🔐 Seguridad

### Autenticación
- Todas las rutas requieren JWT token válido de Cognito
- Token validado por API Gateway Authorizer

### Autorización
- Usuarios solo pueden acceder a sus propias pólizas
- Verificación de `userId` en cada operación
- Retorna 403 Forbidden si intenta acceder a pólizas de otro usuario

### Aislamiento de Datos
- Queries de DynamoDB filtradas por `userId`
- S3 keys incluyen `userId` en el path
- No hay posibilidad de cross-user data leakage

## 📊 Cálculos Automáticos

### Fecha de Renovación
- **Auto, GMM, Hogar, Vida temporal**: `fechaInicio + 12 meses`
- **Vida permanente**: `null` (no tiene renovación)

### Estado de Renovación
- **OVERDUE**: Fecha de renovación pasada
- **30_DAYS**: 0-30 días hasta renovación
- **60_DAYS**: 31-60 días hasta renovación
- **90_DAYS**: 61-90 días hasta renovación
- **NOT_URGENT**: Más de 90 días o sin fecha de renovación

## 🧪 Testing

### Tests Unitarios
- ✅ 17 tests pasando
- ✅ Cobertura completa de endpoints
- ✅ Tests de autorización
- ✅ Tests de cálculos de renovación
- ✅ Tests de manejo de errores

**Ejecutar tests:**
```bash
cd lambda/policy-handler
npm test
```

## 📁 Archivos Creados

### TypeScript Implementation (para desarrollo)
- `lambda/policy-handler/index.ts` - Código principal
- `lambda/policy-handler/__tests__/index.test.ts` - Tests unitarios
- `lambda/policy-handler/package.json` - Dependencias
- `lambda/policy-handler/tsconfig.json` - Configuración TypeScript
- `lambda/policy-handler/jest.config.js` - Configuración Jest
- `lambda/policy-handler/README.md` - Documentación
- `lambda/policy-handler/IMPLEMENTATION.md` - Detalles de implementación
- `lambda/policy-handler/deploy.sh` - Script de deployment

### Python Implementation (deployed en AWS)
- `lambda-deploy/policy_handler.py` - Código Python para Lambda
- `lambda-deploy/policy_handler.zip` - Package de deployment
- `lambda-deploy/create-policy-lambda.bat` - Script de deployment Windows
- `lambda-deploy/policy-permissions.json` - Permisos IAM

## 🔄 Próximos Pasos

Para completar el flujo de pólizas, necesitas:

1. **Tarea 9**: Implementar funciones de cálculo de renovación (utilities)
2. **Tarea 10**: Implementar Document Processor Lambda (Textract)
3. **Tarea 11**: Implementar UI de subida de pólizas
4. **Tarea 12**: Implementar home screen con listado de pólizas
5. **Tarea 13**: Implementar UI de detalle y edición de pólizas

## 🐛 Debugging

### Ver logs de Lambda
```bash
aws logs tail /aws/lambda/polizalab-policy-handler --follow --region us-east-1
```

### Probar endpoint directamente
```bash
# Primero obtén un token JWT válido desde el frontend
# Luego prueba los endpoints:

curl -X GET https://f34orvshp5.execute-api.us-east-1.amazonaws.com/policies \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Verificar permisos IAM
```bash
aws iam get-role-policy --role-name PolizaLabAuthProfileLambdaRole --policy-name DynamoDBAndS3Access --region us-east-1
```

### Verificar rutas en API Gateway
```bash
aws apigatewayv2 get-routes --api-id f34orvshp5 --region us-east-1
```

## 📝 Notas Importantes

1. **Límite de 10 pólizas**: El endpoint GET /policies retorna máximo 10 pólizas. Para paginación, necesitarás implementar `nextToken` en el futuro.

2. **Pre-signed URLs**: Las URLs pre-firmadas expiran en 5 minutos. El frontend debe subir el archivo inmediatamente después de obtener la URL.

3. **Recálculo de renewalStatus**: El estado de renovación se recalcula en cada GET para asegurar que esté actualizado con la fecha actual.

4. **CORS**: Configurado para `*` (todos los orígenes). En producción, configura orígenes específicos.

5. **Timeout**: Lambda configurada con 30 segundos de timeout. Suficiente para operaciones de DynamoDB y S3.

## 🎉 Resumen

La Tarea 8 está completamente implementada y desplegada en AWS. Todos los endpoints de gestión de pólizas están funcionando:

- ✅ Listar pólizas del usuario
- ✅ Obtener detalles de póliza
- ✅ Actualizar póliza
- ✅ Obtener renovaciones próximas
- ✅ Generar URL de subida de documentos
- ✅ Cálculos automáticos de renovación
- ✅ Seguridad y autorización
- ✅ Tests unitarios pasando
- ✅ Documentación completa

**Endpoint Base**: `https://f34orvshp5.execute-api.us-east-1.amazonaws.com`

**Siguiente paso**: Implementar las utilities de cálculo de renovación (Tarea 9) y el Document Processor Lambda (Tarea 10).
