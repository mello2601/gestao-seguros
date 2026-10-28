# Gera o programa Gestão de Seguros para Windows.
#   1. dist\Gestao de Seguros\Gestao de Seguros.exe (programa pronto, pasta portátil)
#   2. dist\Gestao-de-Seguros-Setup.exe              (instalador, se o Inno Setup 6 estiver instalado)
# Uso (PowerShell, na pasta do projeto):  .\build.ps1
$ErrorActionPreference = "Continue"  # PyInstaller escreve logs no stderr; checamos $LASTEXITCODE
Set-Location $PSScriptRoot

$py = ".\.venv-build\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "Criando ambiente de build (.venv-build)..."
    py -3.12 -m venv .venv-build
    & $py -m pip install --quiet --upgrade pip
    & $py -m pip install --quiet pywebview pyinstaller pillow
}

Write-Host "Empacotando com PyInstaller..."
& $py -m PyInstaller --noconfirm --clean --windowed `
    --name "Gestao de Seguros" `
    --icon "assets\icon.ico" `
    --add-data "static;static" `
    --distpath dist --workpath build `
    app.py
if ($LASTEXITCODE -ne 0) { throw "PyInstaller falhou" }
Write-Host "Programa gerado em: dist\Gestao de Seguros\Gestao de Seguros.exe"

$iscc = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($iscc) {
    Write-Host "Gerando instalador com Inno Setup..."
    & $iscc /Q "installer.iss"
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup falhou" }
    Write-Host "Instalador gerado em: dist\Gestao-de-Seguros-Setup.exe"
} else {
    Write-Host "Inno Setup 6 não encontrado: instalador não gerado (o programa em dist\ já funciona)."
}

