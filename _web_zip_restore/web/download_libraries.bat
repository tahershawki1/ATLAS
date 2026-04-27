@echo off
echo ===================================================
echo     Downloading Required Surveying Libraries...
echo ===================================================

if not exist vendor (
    mkdir vendor
)

echo Downloading html-to-image...
powershell -Command "Invoke-WebRequest -Uri 'https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js' -OutFile 'vendor\html-to-image.min.js'"

echo Downloading jsPDF...
powershell -Command "Invoke-WebRequest -Uri 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' -OutFile 'vendor\jspdf.umd.min.js'"

echo.
echo ===================================================
echo      Download Complete! You can close this window.
echo ===================================================
pause
