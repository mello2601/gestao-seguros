# Gestão de Seguros

Sistema de gestão de seguros: segurados, apólices, renovações, financeiro (prêmios e comissões) e exportação para Excel.

## Estrutura

| Arquivo / pasta | O que é |
|---|---|
| `server.py` | Servidor local + banco SQLite + regras de negócio |
| `validacao.py` | Regras de validação dos cadastros (CPF/CNPJ, telefone, datas, valores, duplicados) |
| `excel.py` | Gerador de planilhas .xlsx (sem dependências) |
| `app.py` | Versão programa: abre a interface numa janela própria (pywebview) |
| `static/` | Interface (HTML, CSS, JavaScript, fontes e logo) |
| `assets/icon.ico` | Ícone do programa e do instalador |
| `build.ps1` | Gera o programa e o instalador |
| `installer.iss` | Configuração do instalador (Inno Setup 6) |

Os **dados** ficam em `%APPDATA%\Gestão de Seguros\seguros.db`, tanto no programa instalado quanto no modo navegador.
Desinstalar o programa **não apaga** os dados. Para fazer backup, copie esse arquivo.

## Rodar durante o desenvolvimento

- No navegador: `py server.py` e abra http://localhost:8000
- Em janela própria: `.venv-build\Scripts\python app.py`

## Gerar uma nova versão

1. Altere o número em `installer.iss` (`#define AppVersion "1.0.1"`).
2. No PowerShell, na pasta do projeto: `.\build.ps1`
3. Resultado:
   - `dist\Gestão de Seguros\` - programa portátil (a pasta inteira)
   - `dist\Gestao-de-Seguros-Setup.exe` - instalador para enviar a outros computadores

Instalar uma versão nova por cima da antiga mantém todos os dados.

Requisitos do build: Python 3.12 e Inno Setup 6 (o `build.ps1` cria o ambiente `.venv-build` sozinho).
Requisito no PC de quem usa: Windows 10 ou 11 (o WebView2 já vem instalado no Windows 11).

