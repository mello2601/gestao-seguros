"""
Subtil Corretora - versão programa (janela própria).
Sobe o servidor local numa porta livre e abre a interface numa janela do Windows (WebView2).
Execute:  .venv-build\\Scripts\\python app.py     |     Gerar o .exe:  .\\build.ps1
"""
import json
import logging
import os
import threading
import urllib.error
import urllib.request
from urllib.parse import urlencode

import webview

import server

os.makedirs(server.DATA_DIR, exist_ok=True)
logging.basicConfig(filename=os.path.join(server.DATA_DIR, "app.log"), level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")

SAVE_DIALOG = getattr(getattr(webview, "FileDialog", None), "SAVE", None) or webview.SAVE_DIALOG


class Api:
    """Funções que a interface (app.js) chama via window.pywebview.api"""

    def __init__(self, base_url):
        self.base_url = base_url
        self._window = None  # com "_" o pywebview não tenta expor este atributo ao JavaScript

    def salvar_excel(self, de, ate):
        try:
            with urllib.request.urlopen(f"{self.base_url}/api/financeiro/excel?{urlencode({'de': de, 'ate': ate})}") as r:
                data = r.read()
                disp = r.headers.get("Content-Disposition", "")
        except urllib.error.HTTPError as e:
            return {"erro": json.loads(e.read() or b"{}").get("erro", "Não foi possível gerar a planilha")}
        nome = disp.split('filename="')[-1].rstrip('"') or "comissoes.xlsx"
        destino = self._window.create_file_dialog(SAVE_DIALOG, directory=os.path.expanduser("~\\Documents"),
                                                 save_filename=nome, file_types=("Planilha Excel (*.xlsx)",))
        if not destino:
            return {"cancelado": True}
        caminho = destino if isinstance(destino, str) else destino[0]
        if not caminho.lower().endswith(".xlsx"):
            caminho += ".xlsx"
        try:
            with open(caminho, "wb") as f:
                f.write(data)
        except PermissionError:
            return {"erro": "Não foi possível salvar: o arquivo está aberto no Excel ou a pasta não permite gravação"}
        return {"caminho": caminho}

    def abrir_arquivo(self, caminho):
        os.startfile(caminho)


def main():
    httpd = server.create_server(port=0)  # porta livre escolhida pelo sistema
    base_url = f"http://127.0.0.1:{httpd.server_address[1]}"
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    logging.info("servidor em %s, banco em %s", base_url, server.DB_PATH)

    api = Api(base_url)
    api._window = webview.create_window(
        "Subtil Corretora", base_url, js_api=api,
        width=1400, height=900, min_size=(1000, 650), background_color="#EDF0EA",
    )
    webview.start(storage_path=os.path.join(server.DATA_DIR, "webview"), private_mode=False)
    httpd.shutdown()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logging.exception("falha ao iniciar")
        raise
