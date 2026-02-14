# Próximos Pasos para Funcionalidad Completa

## ✅ Estado Actual

### Recursos AWS Creados:
1. ✅ Cognito User Pool y App Client
2. ✅ DynamoDB Tables (Users y Policies)
3. ✅ S3 Bucket configurado
4. ✅ Rol IAM: PolizaLabAuthProfileLambdaRole

### Frontend:
1. ✅ Aplicación Next.js funcionando en http://localhost:3000
2. ✅ Páginas de registro y login funcionales
3. ✅ Página de perfil creada (pendiente backend)
4. ✅ Variables de entorno configuradas

## 🔄 Opciones para Completar la Configuración

### Opción A: Configuración Manual Rápida (Recomendada para MVP)

La forma más rápida es usar la **Consola AWS** para crear los recursos restantes:

#### 1. Crear Funciones Lambda en la Consola

**Auth Handler Lambda:**
1. Ve a AWS Lambda Console
2. Click "Create function"
3. Nombre: `polizalab-auth-handler`
4. Runtime: Node.js 18.x
5. Rol: `PolizaLabAuthProfileLambdaRole`
6. Código: Copiar de `lambda/auth-handler/index.ts` (compilado)

**Profile Handler Lambda:**
1. Nombre: `polizalab-profile-handler`
2. Runtime: Node.js 18.x
3. Rol: `PolizaLabAuthProfileLambdaRole`
4. Código: Copiar de `lambda/profile-handler/index.ts`

#### 2. Crear API Gateway HTTP API

1. Ve a API Gateway Console
2. Click "Create API" → HTTP API
3. Nombre: `polizalab-api`
4. Crear Authorizer:
   - Tipo: JWT
   - Issuer: `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Q6BXG6CTj`
   - Audience: `20fc4iknq837tjdk9gbtmvbfv9`

5. Crear Rutas:
   - POST /auth/register → polizalab-auth-handler (sin auth)
   - GET /profile → polizalab-profile-handler (con auth)
   - PUT /profile → polizalab-profile-handler (con auth)
   - POST /profile/image → polizalab-profile-handler (con auth)

6. Configurar CORS:
   - Origins: `http://localhost:3000`
   - Methods: GET, POST, PUT, OPTIONS
   - Headers: Content-Type, Authorization

7. Copiar el Invoke URL y actualizar `.env.local`:
   ```
   NEXT_PUBLIC_API_GATEWAY_URL=https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com
   ```

### Opción B: Usar AWS SAM o Serverless Framework

Si prefieres infraestructura como código:

```bash
# Instalar SAM CLI
# https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

# Crear template.yaml con todas las funciones
# Desplegar todo de una vez
sam deploy --guided
```

### Opción C: Continuar con AWS CLI (Más Lento)

Requiere:
1. Compilar cada función Lambda
2. Crear archivos ZIP
3. Subir a AWS
4. Configurar API Gateway con múltiples comandos
5. Configurar permisos

**Tiempo estimado**: 2-3 horas

## 🚀 Recomendación Inmediata

Para probar rápidamente la funcionalidad completa:

### 1. Crear API Gateway Manualmente (15 minutos)

1. Ve a https://console.aws.amazon.com/apigateway
2. Sigue los pasos de la Opción A arriba
3. Copia el Invoke URL

### 2. Actualizar .env.local

```bash
NEXT_PUBLIC_API_GATEWAY_URL=https://tu-api-id.execute-api.us-east-1.amazonaws.com
```

### 3. Crear Lambda Functions Simples

Por ahora, crea funciones Lambda con código mínimo para probar:

**Auth Handler (código mínimo):**
```javascript
exports.handler = async (event) => {
    const body = JSON.parse(event.body);
    const userId = body.cognitoUserId || 'test-user-id';
    
    // Guardar en DynamoDB
    const AWS = require('aws-sdk');
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    
    await dynamodb.put({
        TableName: 'Users',
        Item: {
            userId: userId,
            email: body.email,
            createdAt: new Date().toISOString()
        }
    }).promise();
    
    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ success: true, userId })
    };
};
```

**Profile Handler (código mínimo):**
```javascript
exports.handler = async (event) => {
    const AWS = require('aws-sdk');
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const s3 = new AWS.S3();
    
    // Extraer userId del token JWT
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub || 'test-user';
    
    if (event.requestContext.http.method === 'GET') {
        const result = await dynamodb.get({
            TableName: 'Users',
            Key: { userId }
        }).promise();
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(result.Item || {})
        };
    }
    
    if (event.requestContext.http.method === 'PUT') {
        const body = JSON.parse(event.body);
        
        await dynamodb.update({
            TableName: 'Users',
            Key: { userId },
            UpdateExpression: 'SET nombre = :nombre, apellido = :apellido',
            ExpressionAttributeValues: {
                ':nombre': body.nombre,
                ':apellido': body.apellido
            }
        }).promise();
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: true })
        };
    }
    
    if (event.requestContext.http.path === '/profile/image') {
        const body = JSON.parse(event.body);
        const key = `profiles/${userId}/${body.fileName}`;
        
        const presignedUrl = s3.getSignedUrl('putObject', {
            Bucket: 'polizalab-documents-dev',
            Key: key,
            Expires: 300,
            ContentType: body.fileType
        });
        
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ presignedUrl, s3Key: key })
        };
    }
};
```

## 📝 Resumen de Tiempo Estimado

| Método | Tiempo | Complejidad |
|--------|--------|-------------|
| Consola AWS Manual | 30-45 min | Baja |
| AWS SAM/Serverless | 1-2 horas | Media |
| AWS CLI Completo | 2-3 horas | Alta |

## 🎯 Mi Recomendación

1. **Ahora mismo**: Crea API Gateway y 2 Lambda functions en la consola (30 min)
2. **Después**: Una vez que funcione, migra a infraestructura como código (SAM/CDK)

¿Quieres que te guíe paso a paso por la consola AWS, o prefieres que continúe con AWS CLI?
