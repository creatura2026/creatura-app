@echo off
:: Tunnel SSM (Session Manager) vers la RDS : la base repond sur localhost:15432.
:: Passe par le port 443 : marche aussi sur les reseaux qui bloquent le 5432 (ecole).
:: Prerequis : AWS CLI v2 et session-manager-plugin.
::
:: Laisser tourner ; Ctrl+C pour fermer. Si l'infra est recreee, passer les nouvelles valeurs :
::   set BASTION_ID=i-xxx && set RDS_HOST=xxx.rds.amazonaws.com && tunnel-rds.bat

if "%BASTION_ID%"=="" set BASTION_ID=i-089d34b2875cacf56
if "%RDS_HOST%"=="" set RDS_HOST=creatura-db-20261113145712393300000001.czmcmo0s2yvz.eu-north-1.rds.amazonaws.com
if "%LOCAL_PORT%"=="" set LOCAL_PORT=15432

:: Cle AWS et mot de passe DB : lire depuis backend\.env.rds puis backend\.env, sinon utiliser aws configure.
set AWS_KEY_FOUND=0
for %%F in ("%~dp0..\.env.rds" "%~dp0..\.env") do (
  if %AWS_KEY_FOUND%==0 (
    if exist "%%~F" (
      for /f "tokens=2 delims==" %%A in ('findstr /b "AWS_ACCESS_KEY_ID=" "%%~F"') do set AWS_ACCESS_KEY_ID=%%A
      for /f "tokens=2 delims==" %%A in ('findstr /b "AWS_SECRET_ACCESS_KEY=" "%%~F"') do set AWS_SECRET_ACCESS_KEY=%%A
      if not "%AWS_ACCESS_KEY_ID%"=="" if not "%AWS_SECRET_ACCESS_KEY%"=="" set AWS_KEY_FOUND=1
    )
  )
)
for %%F in ("%~dp0..\.env.rds" "%~dp0..\.env") do (
  if exist "%%~F" (
    for /f "tokens=2 delims==" %%A in ('findstr /b "PGPASSWORD=" "%%~F"') do set PGPASSWORD=%%A
  )
)

aws ssm start-session --region eu-north-1 --target "%BASTION_ID%" ^
  --document-name AWS-StartPortForwardingSessionToRemoteHost ^
  --parameters "host=%RDS_HOST%,portNumber=5432,localPortNumber=%LOCAL_PORT%"
