# Gestão de Seguros

Sistema de gestão de seguros para Windows: segurados, apólices, renovações, financeiro (prêmios e comissões) e exportação para Excel. Funciona offline e guarda tudo num banco SQLite local.

## Instalação (usuários)

**Requisito:** Windows 10 ou 11 (o WebView2 já vem no Windows 11; no Windows 10 o Windows Update costuma instalar).

1. Abra a página de [Releases](https://github.com/mello2601/gestao-seguros/releases/latest).
2. Baixe o `Gestao-de-Seguros-Setup.exe`.
3. Execute o instalador e siga os passos.
4. Abra o **Gestão de Seguros** pelo menu Iniciar ou pelo atalho.

> O instalador não é assinado digitalmente. Se o Windows exibir o aviso "O Windows protegeu o computador" (SmartScreen), clique em **Mais informações → Executar assim mesmo**.

### Seus dados

- Ficam em `%APPDATA%\Gestão de Seguros\seguros.db`.
- Para fazer backup, copie esse arquivo.
- Instalar uma versão nova por cima da antiga mantém todos os dados.
- Desinstalar o programa **não apaga** os dados.

## Rodar a partir do código

Requisito: Python 3.12.

**No navegador** (só usa a biblioteca padrão do Python):

```powershell
py server.py
```

Depois abra http://localhost:8000.

**Em janela própria:**

```powershell
py -3.12 -m venv .venv-build
.venv-build\Scripts\pip install pywebview pyinstaller pillow
.venv-build\Scripts\python app.py
```

## Gerar o instalador

Requisitos: Python 3.12 e [Inno Setup 6](https://jrsoftware.org/isinfo.php).

```powershell
.\build.ps1
```

O resultado fica em `dist\`: o programa portátil em `Gestao de Seguros\` e o instalador `Gestao-de-Seguros-Setup.exe`. Para mudar a versão, edite `AppVersion` em `installer.iss`.

Mais detalhes sobre a estrutura do projeto estão no [LEIAME.md](LEIAME.md).
