# Instrucciones para Corregir CORS

El dominio `crm.antesdefirmar.org` ya está configurado correctamente en Route 53 y CloudFront, pero las funciones Lambda necesitan ser actualizadas para incluir el nuevo dominio en los headers CORS.

## Estado Actual

✅ Route 53: Registro A creado para crm.antesdefirmar.org
✅ CloudFront: Dominio personalizado agregado con certificado SSL
✅ Código Lambda: Actualizado localmente con CORS corregido
❌ Lambda Functions: Pendiente de actualizar en AWS

## Archivos Actualizados

Los siguientes archivos ya tienen los headers CORS corregidos:
- `lambda-deploy/auth_handler.py`
- `lambda-deploy/profile_handler.py`
- `lambda-deploy/policy_handler.py`

Los archivos ZIP están listos:
- `lambda-deploy/auth_handler.zip`
- `lambda-deploy/profile_handler.zip`
- `lambda-deploy/policy_handler.zip`

## Opción 1: Actualizar con Script PowerShell

```powershell
cd lambda-deploy
powershell -ExecutionPolicy Bypass -File update-lambdas-simple.ps1
```

## Opción 2: Actualizar Manualmente

Ejecuta estos comandos uno por uno desde el directorio `lambda-deploy`:

```powershell
# Actualizar auth handler
aws lambda update-function-code --function-name polizalab-auth-handler --zip-file fileb://auth_handler.zip --region us-east-1

# Actualizar profile handler
aws lambda update-function-code --function-name polizalab-profile-handler --zip-file fileb://profile_handler.zip --region us-east-1

# Actualizar policy handler
aws lambda update-function-code --function-name polizalab-policy-handler --zip-file fileb://policy_handler.zip --region us-east-1
```

## Verificación

Después de actualizar las funciones Lambda:

1. Espera 1-2 minutos para que los cambios se propaguen
2. Navega a https://crm.antesdefirmar.org/login
3. Inicia sesión con:
   - Email: canobertin@gmail.com
   - Password: bZwmjqSaPtVK5X9
4. Deberías ser redirigido a /profile sin errores de CORS

## Cambios Realizados en el Código

Los handlers Lambda ahora incluyen:

```python
def get_cors_headers(event):
    """Get CORS headers based on request origin"""
    origin = event.get('headers', {}).get('origin', '')
    allowed_origins = [
        'https://d4srl7zbv9blh.cloudfront.net',
        'https://crm.antesdefirmar.org'
    ]
    
    # Set CORS origin based on request origin
    cors_origin = origin if origin in allowed_origins else allowed_origins[0]
    
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': cors_origin,
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
    }
```

Esto permite que las funciones Lambda acepten solicitudes tanto del dominio CloudFront original como del nuevo dominio personalizado.

## Troubleshooting

Si después de actualizar las funciones Lambda sigues viendo errores de CORS:

1. Verifica que las funciones se actualizaron correctamente:
   ```powershell
   aws lambda get-function --function-name polizalab-profile-handler --region us-east-1
   ```

2. Revisa los logs de CloudWatch para ver si hay errores:
   ```powershell
   aws logs tail /aws/lambda/polizalab-profile-handler --follow --region us-east-1
   ```

3. Asegúrate de que el API Gateway tenga CORS habilitado para el endpoint `/profile`

## Resumen

Una vez que actualices las funciones Lambda, el login y la carga del perfil deberían funcionar correctamente en `https://crm.antesdefirmar.org`.
