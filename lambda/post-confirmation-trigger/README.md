# Cognito Post-Confirmation Trigger

Lambda function que se ejecuta automáticamente después de que un usuario confirma su email en Cognito. Crea el perfil del usuario en DynamoDB.

## Funcionalidad

Cuando un usuario confirma su email:
1. Cognito ejecuta esta Lambda automáticamente
2. La Lambda extrae la información del usuario (userId, email)
3. Crea un registro en la tabla `Users` de DynamoDB con:
   - `userId`: UUID del usuario de Cognito
   - `email`: Email del usuario
   - `nombre`: null (se llenará después)
   - `apellido`: null (se llenará después)
   - `profileImage`: null (se subirá después)
   - `createdAt`: Timestamp de creación
   - `updatedAt`: Timestamp de actualización

## Deployment

### Paso 1: Crear la Lambda Function

```bash
# Crear el paquete de deployment
cd lambda/post-confirmation-trigger
zip function.zip index.py

# Crear la función Lambda
aws lambda create-function \
  --function-name cognito-post-confirmation-trigger \
  --runtime python3.11 \
  --role arn:aws:iam::584876396768:role/lambda-dynamodb-role \
  --handler index.lambda_handler \
  --zip-file fileb://function.zip \
  --environment Variables="{USERS_TABLE=Users}" \
  --region us-east-1

# Limpiar
rm function.zip
```

### Paso 2: Dar permisos a Cognito para invocar la Lambda

```bash
aws lambda add-permission \
  --function-name cognito-post-confirmation-trigger \
  --statement-id CognitoTrigger \
  --action lambda:InvokeFunction \
  --principal cognito-idp.amazonaws.com \
  --source-arn arn:aws:cognito-idp:us-east-1:584876396768:userpool/us-east-1_Q6BXG6CTj \
  --region us-east-1
```

### Paso 3: Configurar el trigger en Cognito

```bash
# Obtener el ARN de la Lambda
aws lambda get-function \
  --function-name cognito-post-confirmation-trigger \
  --query 'Configuration.FunctionArn' \
  --output text \
  --region us-east-1

# Configurar el trigger en Cognito User Pool
aws cognito-idp update-user-pool \
  --user-pool-id us-east-1_Q6BXG6CTj \
  --lambda-config PostConfirmation=arn:aws:lambda:us-east-1:584876396768:function:cognito-post-confirmation-trigger \
  --region us-east-1
```

## Testing

### 1. Registrar un nuevo usuario

```bash
# Desde la aplicación web o usando AWS CLI
aws cognito-idp sign-up \
  --client-id 20fc4iknq837tjdk9gbtmvbfv9 \
  --username test3@polizalab.com \
  --password Test123! \
  --user-attributes Name=email,Value=test3@polizalab.com \
  --region us-east-1
```

### 2. Confirmar el usuario

```bash
# Confirmar manualmente (en producción se usa el código del email)
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id us-east-1_Q6BXG6CTj \
  --username test3@polizalab.com \
  --region us-east-1
```

### 3. Verificar que el perfil se creó en DynamoDB

```bash
# Obtener el userId del usuario
aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_Q6BXG6CTj \
  --username test3@polizalab.com \
  --query 'UserAttributes[?Name==`sub`].Value' \
  --output text \
  --region us-east-1

# Verificar que existe en DynamoDB
aws dynamodb get-item \
  --table-name Users \
  --key '{"userId":{"S":"USER_ID_AQUI"}}' \
  --region us-east-1
```

## Actualizar la Lambda

Si necesitas actualizar el código:

```bash
# PowerShell
.\deploy.ps1

# Bash
./deploy.sh
```

## Logs

Ver los logs de ejecución:

```bash
aws logs tail /aws/lambda/cognito-post-confirmation-trigger --follow --region us-east-1
```

## Troubleshooting

### Error: Lambda no se ejecuta

1. Verificar que el trigger está configurado:
```bash
aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_Q6BXG6CTj \
  --query 'UserPool.LambdaConfig' \
  --region us-east-1
```

2. Verificar permisos de la Lambda:
```bash
aws lambda get-policy \
  --function-name cognito-post-confirmation-trigger \
  --region us-east-1
```

### Error: Access Denied a DynamoDB

Verificar que el rol de la Lambda tiene permisos para escribir en DynamoDB:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:584876396768:table/Users"
    }
  ]
}
```

## Notas Importantes

- La Lambda NO debe fallar el proceso de confirmación si hay un error
- Si la creación del perfil falla, el usuario aún puede iniciar sesión
- El perfil se puede crear manualmente después si es necesario
- Los logs se guardan en CloudWatch Logs
