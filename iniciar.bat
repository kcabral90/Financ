@echo off
chcp 65001 > nul
echo ════════════════════════════════════════════
echo    Financas Livre — Iniciando servidor...
echo ════════════════════════════════════════════
echo.
echo  O app sera aberto em: http://localhost:8080
echo  Mantenha esta janela aberta enquanto usar!
echo  Para encerrar: feche esta janela.
echo.

:: Start server in background and open browser after 1.5s
start /B python -m http.server 8080 2>nul
timeout /t 2 /nobreak > nul
start "" "http://localhost:8080"

:: Keep window open (the server runs in background tied to this window)
python -m http.server 8080 2>nul
if %errorlevel% neq 0 (
  py -m http.server 8080 2>nul
)
if %errorlevel% neq 0 (
  echo.
  echo  ERRO: Python nao encontrado no sistema.
  echo  Instale Python em: https://www.python.org/downloads/
  echo  (Marque "Add to PATH" durante a instalacao)
  echo.
  pause
)
