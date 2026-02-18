# Script para actualizar las funciones Lambda con los nuevos handlers CORS

Write-Host "Actualizando funciones Lambda con CORS corregido..."

# Actualizar auth handler
Write-Host "Actualizando polizalab-auth-handler..."
aws lambda update-function-code --function-name polizalab-auth-handler --zip-file fileb://auth_handler.zip --region us-east-1

# Actualizar profile handler
Write-Host "Actualizando polizalab-profile-handler..."
aws lambda update-function-code --function-name polizalab-profile-handler --zip-file fileb://profile_handler.zip --region us-east-1

# Actualizar policy handler
Write-Host "Actualizando polizalab-policy-handler..."
aws lambda update-function-code --function-name polizalab-policy-handler --zip-file fileb://policy_handler.zip --region us-east-1

Write-Host "Todas las funciones Lambda han sido actualizadas"
