@echo off
title JOPACAMEAsistencia - Servidor + Tunel
cd /d "%~dp0"
echo ========================================
echo  Iniciando JOPACAMEAsistencia...
echo ========================================
echo.
:: Verificar si el servidor ya esta corriendo
curl -s -o NUL http://localhost:3000/ 2>nul
if %errorlevel% neq 0 (
    echo  Iniciando servidor Node.js...
    start /B node server.js
    timeout /t 2 /nobreak >nul
    echo  Servidor iniciado.
) else (
    echo  Servidor ya esta corriendo.
)
echo.
echo  Iniciando tunel Cloudflare...
start /B node start_tunnel.js
timeout /t 8 /nobreak >nul
echo.
:: Mostrar URL del tunel
if exist tunnel_url.txt (
    set /p TUNNEL_URL=<tunnel_url.txt
    echo  ==============================================
    echo  TUNEL ACTIVO: %TUNNEL_URL%
    echo  ==============================================
)
echo.
echo  Accesos:
echo    Local:      http://localhost:3000
echo    Red Local:  http://192.168.220.1:3000
echo    Internet:   (ver linea arriba)
echo.
echo  Presiona cualquier tecla para cerrar TODO...
pause >nul
:: Cleanup
taskkill /f /im cloudflared.exe 2>nul
