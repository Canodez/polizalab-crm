# Script para actualizar las funciones Lambda con los nuevos handlers CORS

Write-Host "Actualizando funciones Lambda con CORS corregido..." -ForegroundColor Green

# Actualizar auth handler
Write-Host "`nActualizando polizalab-auth-handler..." -ForegroundColor Yellow
aws lambda update-function-code `
    --function-name polizalab-auth-handler `
    --zip-file fileb://auth_handler.zip `
    --region us-east-1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ polizalab-auth-handler actualizado exitosamente" -ForegroundColor Green
} else {
    Write-Host "✗ Error actualizando polizalab-auth-handler" -ForegroundColor Red
}

# Actualizar profile handler
Write-Host "`nActualizando polizalab-profile-handler..." -ForegroundColor Yellow
aws lambda update-function-code `
    --function-name polizalab-profile-handler `
    --zip-file fileb://profile_handler.zip `
    --region us-east-1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ polizalab-profile-handler actualizado exitosamente" -ForegroundColor Green
} else {
    Write-Host "✗ Error actualizando polizalab-profile-handler" -ForegroundColor Red
}

# Actualizar policy handler
Write-Host "`nActualizando polizalab-policy-handler..." -ForegroundColor Yellow
aws lambda update-function-code `
    --function-name polizalab-policy-handler `
    --zip-file fileb://policy_handler.zip `
    --region us-east-1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ polizalab-policy-handler actualizado exitosamente" -ForegroundColor Green
} else {
    Write-Host "✗ Error actualizando polizalab-policy-handler" -ForegroundColor Red
}

Write-Host "`n✓ Todas las funciones Lambda han sido actualizadas" -ForegroundColor Green
Write-Host "`nResumen de cambios:" -ForegroundColor Cyan
Write-Host "- Headers CORS actualizados para soportar crm.antesdefirmar.org"
Write-Host "- Headers CORS dinámicos basados en el origin de la solicitud"
Write-Host "- Access-Control-Allow-Credentials habilitado"
