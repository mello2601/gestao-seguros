"""
Subtil Corretora - sistema de gestão de seguros (servidor local).
Usa apenas a biblioteca padrão do Python (http.server + sqlite3).
Modo navegador:  py server.py   e abra http://localhost:8000
Modo programa:   py app.py      (janela própria; veja build.ps1 para gerar o .exe)
"""
import json
import os
import re
import shutil
import sqlite3
import sys
from datetime import date, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from excel import Workbook, Cell
from validacao import (CampoInvalido, so_digitos, sem_acento, formatar_documento,
                       validar_segurado, validar_apolice, validar_tipo)

# Quando empacotado pelo PyInstaller, os arquivos da interface ficam em sys._MEIPASS
BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Os dados ficam na pasta do usuário, para sobreviver a atualizações/reinstalações do programa
DATA_DIR = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "Subtil Corretora")
DB_PATH = os.path.join(DATA_DIR, "seguros.db")
LEGACY_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seguros.db")  # local antigo (ao lado do server.py)
PORT = 8000

SCHEMA = """
CREATE TABLE IF NOT EXISTS tipos_seguro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    descricao TEXT
);
CREATE TABLE IF NOT EXISTS segurados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    documento TEXT,          -- CPF ou CNPJ
    email TEXT,
    telefone TEXT,
    data_nascimento TEXT,
    endereco TEXT,
    cidade TEXT,
    observacoes TEXT,
    criado_em TEXT DEFAULT (date('now'))
);
CREATE TABLE IF NOT EXISTS apolices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    segurado_id INTEGER NOT NULL REFERENCES segurados(id) ON DELETE CASCADE,
    tipo_id INTEGER NOT NULL REFERENCES tipos_seguro(id),
    seguradora TEXT NOT NULL,
    data_inicio TEXT NOT NULL,
    data_fim TEXT NOT NULL,
    premio REAL DEFAULT 0,       -- valor pago pelo segurado
    importancia_segurada REAL DEFAULT 0,
    comissao_pct REAL DEFAULT 0,
    forma_pagamento TEXT,
    situacao TEXT DEFAULT 'ativa', -- ativa | renovada | cancelada
    renovada_de INTEGER REFERENCES apolices(id),
    bem_segurado TEXT,           -- ex.: veículo, imóvel
    observacoes TEXT
);
"""


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def status_apolice(row, hoje=None):
    """Status calculado a partir da situação e das datas."""
    hoje = hoje or date.today()
    if row["situacao"] == "cancelada":
        return "Cancelada"
    if row["situacao"] == "renovada":
        return "Renovada"
    fim = date.fromisoformat(row["data_fim"])
    if fim < hoje:
        return "Vencida"
    if fim <= hoje + timedelta(days=30):
        return "A vencer"
    return "Vigente"


def add_years(d, n):
    try:
        return d.replace(year=d.year + n)
    except ValueError:  # 29/02
        return d.replace(year=d.year + n, day=28)


def seed(conn):
    if conn.execute("SELECT COUNT(*) FROM tipos_seguro").fetchone()[0]:
        return
    tipos = [
        ("Automóvel", "Cobertura para veículos: colisão, roubo, terceiros"),
        ("Residencial", "Incêndio, roubo, danos elétricos na residência"),
        ("Vida", "Morte, invalidez e doenças graves"),
        ("Saúde", "Planos de saúde e odontológicos"),
        ("Empresarial", "Patrimônio e responsabilidade da empresa"),
        ("Viagem", "Despesas médicas e bagagem em viagens"),
    ]
    conn.executemany("INSERT INTO tipos_seguro (nome, descricao) VALUES (?, ?)", tipos)
    if getattr(sys, "frozen", False):
        conn.commit()
        return  # no programa instalado, começa só com os tipos de seguro (sem clientes de exemplo)

    segurados = [
        ("Ana Paula Ferreira", "123.456.789-00", "ana.ferreira@email.com", "(11) 98765-4321", "1985-03-12", "Rua das Flores, 120", "São Paulo"),
        ("Carlos Eduardo Lima", "987.654.321-00", "carlos.lima@email.com", "(21) 99876-5432", "1978-07-25", "Av. Atlântica, 455", "Rio de Janeiro"),
        ("Mariana Souza", "456.789.123-00", "mari.souza@email.com", "(31) 97654-3210", "1992-11-03", "Rua Bahia, 88", "Belo Horizonte"),
        ("Transportes Rápido Ltda", "12.345.678/0001-90", "contato@rapido.com.br", "(41) 3333-4444", None, "Rod. BR-116, km 10", "Curitiba"),
        ("João Pedro Almeida", "321.654.987-00", "jp.almeida@email.com", "(51) 98888-7777", "1969-01-30", "Rua da Praia, 300", "Porto Alegre"),
        ("Fernanda Costa", "654.321.987-00", "fernanda.c@email.com", "(71) 99111-2222", "1990-05-18", "Av. Sete, 1500", "Salvador"),
    ]
    conn.executemany(
        "INSERT INTO segurados (nome, documento, email, telefone, data_nascimento, endereco, cidade) VALUES (?,?,?,?,?,?,?)",
        segurados,
    )

    hoje = date.today()
    # (numero, segurado, tipo, seguradora, inicio_offset_dias, premio, IS, bem)
    apolices = [
        ("AUTO-2025-0001", 1, 1, "Porto Seguro", -350, 2850.00, 85000, "Honda Civic 2022 - ABC1D23"),
        ("RES-2025-0102", 1, 2, "Allianz", -200, 640.00, 450000, "Apartamento Rua das Flores, 120"),
        ("VIDA-2024-0330", 2, 3, "SulAmérica", -400, 1200.00, 500000, None),
        ("AUTO-2025-0045", 2, 1, "Tokio Marine", -340, 3400.00, 120000, "Toyota Corolla 2023 - XYZ9K87"),
        ("SAU-2025-0007", 3, 4, "Bradesco Seguros", -100, 7800.00, 0, "Plano familiar - 3 vidas"),
        ("EMP-2025-0010", 4, 5, "Mapfre", -320, 15800.00, 2500000, "Galpão e frota"),
        ("AUTO-2025-0088", 4, 1, "HDI", -30, 9800.00, 380000, "Caminhão Volvo FH 540"),
        ("VIA-2025-0500", 5, 6, "Assist Card", -380, 350.00, 100000, "Viagem Europa"),
        ("RES-2025-0150", 5, 2, "Porto Seguro", -300, 520.00, 380000, "Casa Rua da Praia, 300"),
        ("VIDA-2025-0412", 6, 3, "Itaú Seguros", -15, 980.00, 300000, None),
    ]
    for num, seg, tipo, cia, off, premio, imp, bem in apolices:
        ini = hoje + timedelta(days=off)
        fim = add_years(ini, 1)
        conn.execute(
            """INSERT INTO apolices (numero, segurado_id, tipo_id, seguradora, data_inicio, data_fim,
               premio, importancia_segurada, comissao_pct, forma_pagamento, bem_segurado)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (num, seg, tipo, cia, ini.isoformat(), fim.isoformat(), premio, imp, 15, "Cartão 10x", bem),
        )
    conn.commit()


def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DB_PATH) and os.path.exists(LEGACY_DB):
        shutil.copy2(LEGACY_DB, DB_PATH)  # migra os dados da versão anterior
    conn = get_db()
    conn.executescript(SCHEMA)
    seed(conn)
    # padroniza CPF/CNPJ já cadastrados (000.000.000-00 / 00.000.000/0000-00)
    for sid, doc in conn.execute("SELECT id, documento FROM segurados WHERE documento IS NOT NULL").fetchall():
        if formatar_documento(doc) != doc:
            conn.execute("UPDATE segurados SET documento = ? WHERE id = ?", (formatar_documento(doc), sid))
    conn.commit()
    conn.close()


APOLICE_SELECT = """
SELECT a.*, s.nome AS segurado_nome, s.documento AS segurado_documento, t.nome AS tipo_nome
FROM apolices a
JOIN segurados s ON s.id = a.segurado_id
JOIN tipos_seguro t ON t.id = a.tipo_id
"""


def apolice_dict(row):
    d = dict(row)
    d["status"] = status_apolice(row)
    d["dias_para_vencer"] = (date.fromisoformat(row["data_fim"]) - date.today()).days
    return d


SEGURADO_FIELDS = ["nome", "documento", "email", "telefone", "data_nascimento", "endereco", "cidade", "observacoes"]
APOLICE_FIELDS = ["numero", "segurado_id", "tipo_id", "seguradora", "data_inicio", "data_fim", "premio",
                  "importancia_segurada", "comissao_pct", "forma_pagamento", "situacao", "bem_segurado", "observacoes"]


class ApiError(Exception):
    def __init__(self, status, msg, **extra):
        super().__init__(msg)
        self.status = status
        self.extra = extra  # campos adicionais devolvidos junto com o erro


# ---------------------------------------------------------------- handlers

def dashboard(conn, q, body):
    rows = [apolice_dict(r) for r in conn.execute(APOLICE_SELECT)]
    ativas = [r for r in rows if r["status"] in ("Vigente", "A vencer")]
    por_tipo = {}
    for r in ativas:
        por_tipo.setdefault(r["tipo_nome"], {"qtd": 0, "premio": 0})
        por_tipo[r["tipo_nome"]]["qtd"] += 1
        por_tipo[r["tipo_nome"]]["premio"] += r["premio"] or 0
    a_vencer = sorted([r for r in rows if r["status"] in ("A vencer", "Vencida")], key=lambda r: r["data_fim"])
    return {
        "total_segurados": conn.execute("SELECT COUNT(*) FROM segurados").fetchone()[0],
        "apolices_ativas": len(ativas),
        "a_vencer_30": sum(1 for r in rows if r["status"] == "A vencer"),
        "vencidas": sum(1 for r in rows if r["status"] == "Vencida"),
        "premio_total": sum(r["premio"] or 0 for r in ativas),
        "comissao_total": sum((r["premio"] or 0) * (r["comissao_pct"] or 0) / 100 for r in ativas),
        "por_tipo": [{"tipo": k, **v} for k, v in sorted(por_tipo.items())],
        "proximas_renovacoes": a_vencer[:8],
    }


def list_segurados(conn, q, body):
    termo = q.get("q", [""])[0].strip()
    sql = """SELECT s.*, (SELECT COUNT(*) FROM apolices a WHERE a.segurado_id = s.id AND a.situacao = 'ativa') AS qtd_apolices
             FROM segurados s"""
    params = []
    if termo:
        like = f"%{termo}%"
        sql += " WHERE s.nome LIKE ? OR s.documento LIKE ? OR s.email LIKE ? OR s.telefone LIKE ? OR s.cidade LIKE ?"
        params = [like] * 5
    sql += " ORDER BY s.nome"
    return [dict(r) for r in conn.execute(sql, params)]


def get_segurado(conn, q, body, sid):
    row = conn.execute("SELECT * FROM segurados WHERE id = ?", (sid,)).fetchone()
    if not row:
        raise ApiError(404, "Segurado não encontrado")
    d = dict(row)
    d["apolices"] = [apolice_dict(r) for r in conn.execute(APOLICE_SELECT + " WHERE a.segurado_id = ? ORDER BY a.data_fim DESC", (sid,))]
    return d


def segurado_com_documento(conn, documento, ignorar_id=None):
    """Procura outro segurado com o mesmo CPF/CNPJ, comparando só os dígitos (ignora pontos, traços e barras)."""
    d = so_digitos(documento)
    if not d:
        return None
    return conn.execute(
        """SELECT id, nome, documento FROM segurados
           WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(documento, ''), '.', ''), '-', ''), '/', ''), ' ', '') = ?
             AND id != ?""",
        (d, ignorar_id or 0),
    ).fetchone()


def verificar_documento(conn, q, body):
    existente = segurado_com_documento(conn, q.get("documento", [""])[0], int(q.get("ignorar", ["0"])[0] or 0))
    return {"existe": bool(existente), **(dict(existente) if existente else {})}


def save_segurado(conn, q, body, sid=None):
    anterior = conn.execute("SELECT documento FROM segurados WHERE id = ?", (sid,)).fetchone() if sid else None
    validar_segurado(body, anterior["documento"] if anterior else None)
    existente = segurado_com_documento(conn, body["documento"], sid)
    if existente:
        raise CampoInvalido("documento", f"O CPF/CNPJ {existente['documento']} já está cadastrado para {existente['nome']}",
                            status=409, segurado_id=existente["id"], segurado_nome=existente["nome"])
    vals = [body.get(f) or None for f in SEGURADO_FIELDS]
    if sid:
        conn.execute(f"UPDATE segurados SET {', '.join(f + ' = ?' for f in SEGURADO_FIELDS)} WHERE id = ?", vals + [sid])
    else:
        sid = conn.execute(f"INSERT INTO segurados ({', '.join(SEGURADO_FIELDS)}) VALUES ({', '.join('?' * len(SEGURADO_FIELDS))})", vals).lastrowid
    conn.commit()
    return {"id": sid}


def delete_segurado(conn, q, body, sid):
    conn.execute("DELETE FROM segurados WHERE id = ?", (sid,))
    conn.commit()
    return {"ok": True}


def list_apolices(conn, q, body):
    termo = q.get("q", [""])[0].strip()
    tipo = q.get("tipo", [""])[0]
    status = q.get("status", [""])[0]
    sql, params, where = APOLICE_SELECT, [], []
    if termo:
        like = f"%{termo}%"
        where.append("(a.numero LIKE ? OR s.nome LIKE ? OR s.documento LIKE ? OR a.seguradora LIKE ? OR a.bem_segurado LIKE ?)")
        params += [like] * 5
    if tipo:
        where.append("a.tipo_id = ?")
        params.append(tipo)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY a.data_fim"
    rows = [apolice_dict(r) for r in conn.execute(sql, params)]
    if status:
        rows = [r for r in rows if r["status"] == status]
    return rows


def get_apolice(conn, q, body, aid):
    row = conn.execute(APOLICE_SELECT + " WHERE a.id = ?", (aid,)).fetchone()
    if not row:
        raise ApiError(404, "Apólice não encontrada")
    d = apolice_dict(row)
    # histórico de renovações (para trás e para frente)
    hist = []
    cur = row
    while cur["renovada_de"]:
        cur = conn.execute(APOLICE_SELECT + " WHERE a.id = ?", (cur["renovada_de"],)).fetchone()
        hist.append(apolice_dict(cur))
    nxt = conn.execute(APOLICE_SELECT + " WHERE a.renovada_de = ?", (aid,)).fetchone()
    d["historico"] = hist
    d["renovacao"] = apolice_dict(nxt) if nxt else None
    return d


def seguradoras_cadastradas(conn):
    return [r[0] for r in conn.execute("SELECT DISTINCT seguradora FROM apolices")]


def apolice_com_numero(conn, numero, seguradora, ignorar_id=None):
    """Outra apólice com o mesmo número na mesma seguradora (sem diferenciar maiúsculas, acentos e espaços)."""
    alvo = (sem_acento(numero).replace(" ", ""), sem_acento(seguradora))
    for r in conn.execute(APOLICE_SELECT + " WHERE a.id != ?", (ignorar_id or 0,)):
        if (sem_acento(r["numero"]).replace(" ", ""), sem_acento(r["seguradora"])) == alvo:
            return r
    return None


def checar_apolice(conn, body, aid=None):
    validar_apolice(body, seguradoras_cadastradas(conn))
    if not conn.execute("SELECT 1 FROM segurados WHERE id = ?", (body["segurado_id"],)).fetchone():
        raise CampoInvalido("segurado_id", "Segurado não encontrado. Selecione novamente")
    if not conn.execute("SELECT 1 FROM tipos_seguro WHERE id = ?", (body["tipo_id"],)).fetchone():
        raise CampoInvalido("tipo_id", "Tipo de seguro não encontrado. Selecione novamente")
    outra = apolice_com_numero(conn, body["numero"], body["seguradora"], aid)
    if outra:
        raise CampoInvalido("numero", f"A apólice {outra['numero']} da {outra['seguradora']} já está cadastrada "
                            f"(segurado: {outra['segurado_nome']})", status=409, apolice_id=outra["id"])


def verificar_apolice(conn, q, body):
    outra = apolice_com_numero(conn, q.get("numero", [""])[0], q.get("seguradora", [""])[0], int(q.get("ignorar", ["0"])[0] or 0))
    return {"existe": bool(outra), **({"id": outra["id"], "numero": outra["numero"], "segurado_nome": outra["segurado_nome"]} if outra else {})}


def save_apolice(conn, q, body, aid=None):
    checar_apolice(conn, body, aid)
    vals = [body.get(f) if body.get(f) != "" else None for f in APOLICE_FIELDS]
    if aid:
        conn.execute(f"UPDATE apolices SET {', '.join(f + ' = ?' for f in APOLICE_FIELDS)} WHERE id = ?", vals + [aid])
    else:
        aid = conn.execute(f"INSERT INTO apolices ({', '.join(APOLICE_FIELDS)}) VALUES ({', '.join('?' * len(APOLICE_FIELDS))})", vals).lastrowid
    conn.commit()
    return {"id": aid}


def delete_apolice(conn, q, body, aid):
    conn.execute("UPDATE apolices SET renovada_de = NULL WHERE renovada_de = ?", (aid,))
    conn.execute("DELETE FROM apolices WHERE id = ?", (aid,))
    conn.commit()
    return {"ok": True}


def renovar_apolice(conn, q, body, aid):
    old = conn.execute("SELECT * FROM apolices WHERE id = ?", (aid,)).fetchone()
    if not old:
        raise ApiError(404, "Apólice não encontrada")
    if old["situacao"] != "ativa":
        raise ApiError(400, "Apenas apólices ativas podem ser renovadas")
    fim_antigo = date.fromisoformat(old["data_fim"])
    novo = {
        "numero": body.get("numero") or old["numero"] + "-R",
        "segurado_id": old["segurado_id"],
        "tipo_id": old["tipo_id"],
        "seguradora": body.get("seguradora") or old["seguradora"],
        "data_inicio": body.get("data_inicio") or fim_antigo.isoformat(),
        "data_fim": body.get("data_fim") or add_years(fim_antigo, 1).isoformat(),
        "premio": body.get("premio") if body.get("premio") not in (None, "") else old["premio"],
        "importancia_segurada": body.get("importancia_segurada") if body.get("importancia_segurada") not in (None, "") else old["importancia_segurada"],
        "comissao_pct": old["comissao_pct"],
        "forma_pagamento": old["forma_pagamento"],
        "situacao": "ativa",
        "bem_segurado": old["bem_segurado"],
        "observacoes": body.get("observacoes") or old["observacoes"],
    }
    checar_apolice(conn, novo)
    vals = [novo[f] for f in APOLICE_FIELDS]
    new_id = conn.execute(
        f"INSERT INTO apolices ({', '.join(APOLICE_FIELDS)}, renovada_de) VALUES ({', '.join('?' * (len(APOLICE_FIELDS) + 1))})",
        vals + [aid],
    ).lastrowid
    conn.execute("UPDATE apolices SET situacao = 'renovada' WHERE id = ?", (aid,))
    conn.commit()
    return {"id": new_id}


def list_renovacoes(conn, q, body):
    de = q.get("de", [""])[0]
    ate = q.get("ate", [""])[0]
    if de or ate:
        # período escolhido pelo usuário (vencimento entre "de" e "ate")
        rows = conn.execute(
            APOLICE_SELECT + " WHERE a.situacao = 'ativa' AND a.data_fim >= ? AND a.data_fim <= ? ORDER BY a.data_fim",
            (de or "0000-01-01", ate or "9999-12-31"),
        )
        return [apolice_dict(r) for r in rows]
    dias = int(q.get("dias", ["60"])[0])
    limite = (date.today() + timedelta(days=dias)).isoformat()
    rows = conn.execute(APOLICE_SELECT + " WHERE a.situacao = 'ativa' AND a.data_fim <= ? ORDER BY a.data_fim", (limite,))
    return [apolice_dict(r) for r in rows]


def list_tipos(conn, q, body):
    return [dict(r) for r in conn.execute(
        """SELECT t.*, (SELECT COUNT(*) FROM apolices a WHERE a.tipo_id = t.id AND a.situacao = 'ativa') AS qtd_apolices
           FROM tipos_seguro t ORDER BY t.nome""")]


def save_tipo(conn, q, body, tid=None):
    outros = [r[0] for r in conn.execute("SELECT nome FROM tipos_seguro WHERE id != ?", (tid or 0,))]
    nome = validar_tipo(body, outros)["nome"]
    try:
        if tid:
            conn.execute("UPDATE tipos_seguro SET nome = ?, descricao = ? WHERE id = ?", (nome, body.get("descricao"), tid))
        else:
            tid = conn.execute("INSERT INTO tipos_seguro (nome, descricao) VALUES (?, ?)", (nome, body.get("descricao"))).lastrowid
    except sqlite3.IntegrityError:
        raise ApiError(400, "Já existe um tipo com esse nome")
    conn.commit()
    return {"id": tid}


def delete_tipo(conn, q, body, tid):
    if conn.execute("SELECT COUNT(*) FROM apolices WHERE tipo_id = ?", (tid,)).fetchone()[0]:
        raise ApiError(400, "Existem apólices deste tipo; não é possível excluir")
    conn.execute("DELETE FROM tipos_seguro WHERE id = ?", (tid,))
    conn.commit()
    return {"ok": True}


MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def periodo_param(q):
    """Lê ?de=AAAA-MM-DD&ate=AAAA-MM-DD; padrão: ano corrente."""
    hoje = date.today()
    try:
        de = date.fromisoformat(q.get("de", [""])[0] or f"{hoje.year}-01-01")
        ate = date.fromisoformat(q.get("ate", [""])[0] or f"{hoje.year}-12-31")
    except ValueError:
        raise ApiError(400, "Data inválida. Use o formato AAAA-MM-DD")
    if de > ate:
        raise ApiError(400, "A data inicial deve ser anterior à data final")
    return de, ate


def calcular_financeiro(conn, de, ate):
    """Produção do período: apólices (exceto canceladas) com início de vigência entre de e ate."""
    rows = conn.execute(
        APOLICE_SELECT + " WHERE a.situacao != 'cancelada' AND a.data_inicio BETWEEN ? AND ? ORDER BY a.data_inicio",
        (de.isoformat(), ate.isoformat()),
    ).fetchall()
    apolices = []
    for r in rows:
        d = apolice_dict(r)
        d["premio"] = d["premio"] or 0
        d["comissao_pct"] = d["comissao_pct"] or 0
        d["comissao"] = round(d["premio"] * d["comissao_pct"] / 100, 2)
        apolices.append(d)

    premio_total = sum(a["premio"] for a in apolices)
    comissao_total = sum(a["comissao"] for a in apolices)

    clientes = {}
    for a in apolices:
        c = clientes.setdefault(a["segurado_id"], {
            "segurado_id": a["segurado_id"], "nome": a["segurado_nome"], "documento": a["segurado_documento"],
            "apolices": 0, "seguradoras": [], "premio": 0.0, "comissao": 0.0})
        c["apolices"] += 1
        if a["seguradora"] not in c["seguradoras"]:
            c["seguradoras"].append(a["seguradora"])
        c["premio"] += a["premio"]
        c["comissao"] += a["comissao"]
    for c in clientes.values():
        c["pct_comissao"] = c["comissao"] / c["premio"] if c["premio"] else 0
        c["participacao"] = c["comissao"] / comissao_total if comissao_total else 0
    por_cliente = sorted(clientes.values(), key=lambda c: -c["comissao"])

    # série mensal contínua entre de e ate (meses sem produção aparecem zerados)
    por_mes, y, m = [], de.year, de.month
    while (y, m) <= (ate.year, ate.month) and len(por_mes) < 120:
        chave = f"{y}-{m:02d}"
        doMes = [a for a in apolices if a["data_inicio"].startswith(chave)]
        por_mes.append({"mes": chave, "rotulo": f"{MESES[m - 1]}/{str(y)[2:]}",
                        "premio": sum(a["premio"] for a in doMes), "comissao": sum(a["comissao"] for a in doMes)})
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)

    return {
        "de": de.isoformat(), "ate": ate.isoformat(),
        "premio_total": premio_total, "comissao_total": comissao_total,
        "pct_medio": comissao_total / premio_total if premio_total else 0,
        "qtd_apolices": len(apolices), "qtd_clientes": len(clientes),
        "por_cliente": por_cliente, "por_mes": por_mes, "apolices": apolices,
    }


def financeiro(conn, q, body):
    return calcular_financeiro(conn, *periodo_param(q))


class FileResponse:
    def __init__(self, data, content_type, filename):
        self.data, self.content_type, self.filename = data, content_type, filename


def financeiro_excel(conn, q, body):
    de, ate = periodo_param(q)
    f = calcular_financeiro(conn, de, ate)
    periodo = f"Período: {de.strftime('%d/%m/%Y')} a {ate.strftime('%d/%m/%Y')} (apólices com início de vigência no período, exceto canceladas)"
    wb = Workbook()

    # --- aba 1: resumo
    ws = wb.sheet("Resumo", widths=[34, 22])
    ws.row([Cell("Subtil Corretora - Relatório de prêmios e comissões", "title")])
    ws.row([Cell(periodo, "muted")])
    ws.row([Cell(f"Gerado em {date.today().strftime('%d/%m/%Y')}", "muted")])
    ws.row()
    ws.row([Cell("Indicador", "header"), Cell("Valor", "header")])
    ws.row(["Prêmio total", Cell(f["premio_total"], "money")])
    ws.row(["Comissão total", Cell(f["comissao_total"], "money")])
    ws.row(["Comissão média (% do prêmio)", Cell(f["pct_medio"], "pct")])
    ws.row(["Apólices no período", Cell(f["qtd_apolices"], "int")])
    ws.row(["Clientes no período", Cell(f["qtd_clientes"], "int")])
    ws.row()
    ws.row([Cell("Mês", "header"), Cell("Prêmio", "header"), Cell("Comissão", "header")])
    first = len(ws.rows) + 1
    for m in f["por_mes"]:
        ws.row([m["rotulo"], Cell(m["premio"], "money"), Cell(m["comissao"], "money")])
    last = len(ws.rows)
    ws.widths = [34, 22, 22]
    if f["por_mes"]:
        ws.row([Cell("Total", "bold"), Cell(f"=SUM(B{first}:B{last})", "money_bold"), Cell(f"=SUM(C{first}:C{last})", "money_bold")])

    # --- aba 2: por cliente
    ws = wb.sheet("Por cliente", widths=[36, 20, 30, 18, 18, 14, 16], freeze_row=2)
    ws.row([Cell(h, "header") for h in ["Cliente", "CPF/CNPJ", "Seguradora", "Prêmio", "Comissão", "% comissão", "Participação"]])
    first = 2
    for c in f["por_cliente"]:
        r = len(ws.rows) + 1
        ws.row([c["nome"], c["documento"] or "", ", ".join(sorted(c["seguradoras"])), Cell(c["premio"], "money"),
                Cell(c["comissao"], "money"), Cell(f"=IF(D{r}=0,0,E{r}/D{r})", "pct"), Cell(c["participacao"], "pct")])
    last = len(ws.rows)
    if f["por_cliente"]:
        t = last + 1
        ws.row([Cell("Total", "bold"), Cell("", "bold"), Cell("", "bold"),
                Cell(f"=SUM(D{first}:D{last})", "money_bold"), Cell(f"=SUM(E{first}:E{last})", "money_bold"),
                Cell(f"=IF(D{t}=0,0,E{t}/D{t})", "pct_bold"), Cell(f"=SUM(G{first}:G{last})", "pct_bold")])

    # --- aba 3: apólices
    ws = wb.sheet("Apólices", widths=[20, 32, 20, 16, 20, 13, 13, 16, 12, 16, 12], freeze_row=2)
    ws.row([Cell(h, "header") for h in ["Apólice", "Cliente", "CPF/CNPJ", "Tipo", "Seguradora", "Início", "Fim",
                                         "Prêmio", "% comissão", "Comissão", "Situação"]])
    for a in f["apolices"]:
        ws.row([a["numero"], a["segurado_nome"], a["segurado_documento"] or "", a["tipo_nome"], a["seguradora"],
                date.fromisoformat(a["data_inicio"]), date.fromisoformat(a["data_fim"]),
                Cell(a["premio"], "money"), Cell(a["comissao_pct"] / 100, "pct"), Cell(a["comissao"], "money"), a["status"]])
    last = len(ws.rows)
    if f["apolices"]:
        ws.row([Cell("Total", "bold")] + [Cell("", "bold")] * 6 + [Cell(f"=SUM(H2:H{last})", "money_bold"), Cell("", "bold"),
               Cell(f"=SUM(J2:J{last})", "money_bold"), Cell("", "bold")])

    nome = f"comissoes_{de.strftime('%d-%m-%Y')}_a_{ate.strftime('%d-%m-%Y')}.xlsx"
    return FileResponse(wb.to_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nome)


def list_seguradoras(conn, q, body):
    return [r[0] for r in conn.execute("SELECT DISTINCT seguradora FROM apolices ORDER BY seguradora")]


ROUTES = [
    ("GET", r"/api/dashboard", dashboard),
    ("GET", r"/api/segurados", list_segurados),
    ("POST", r"/api/segurados", save_segurado),
    ("GET", r"/api/segurados/verificar", verificar_documento),
    ("GET", r"/api/segurados/(\d+)", get_segurado),
    ("PUT", r"/api/segurados/(\d+)", save_segurado),
    ("DELETE", r"/api/segurados/(\d+)", delete_segurado),
    ("GET", r"/api/apolices", list_apolices),
    ("POST", r"/api/apolices", save_apolice),
    ("GET", r"/api/apolices/verificar", verificar_apolice),
    ("GET", r"/api/apolices/(\d+)", get_apolice),
    ("PUT", r"/api/apolices/(\d+)", save_apolice),
    ("DELETE", r"/api/apolices/(\d+)", delete_apolice),
    ("POST", r"/api/apolices/(\d+)/renovar", renovar_apolice),
    ("GET", r"/api/renovacoes", list_renovacoes),
    ("GET", r"/api/tipos", list_tipos),
    ("POST", r"/api/tipos", save_tipo),
    ("PUT", r"/api/tipos/(\d+)", save_tipo),
    ("DELETE", r"/api/tipos/(\d+)", delete_tipo),
    ("GET", r"/api/seguradoras", list_seguradoras),
    ("GET", r"/api/financeiro", financeiro),
    ("GET", r"/api/financeiro/excel", financeiro_excel),
]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, fmt, *args):
        pass  # silencioso

    def _api(self, method):
        url = urlparse(self.path)
        for m, pattern, fn in ROUTES:
            match = re.fullmatch(pattern, url.path)
            if m == method and match:
                body = {}
                length = int(self.headers.get("Content-Length") or 0)
                if length:
                    body = json.loads(self.rfile.read(length) or b"{}")
                conn = get_db()
                try:
                    result, status = fn(conn, parse_qs(url.query), body, *[int(g) for g in match.groups()]), 200
                except ApiError as e:
                    result, status = {"erro": str(e), **e.extra}, e.status
                except CampoInvalido as e:
                    result, status = {"erro": str(e), "campo": e.campo, **e.extra}, e.status
                except Exception as e:  # noqa: BLE001
                    result, status = {"erro": f"Erro interno: {e}"}, 500
                finally:
                    conn.close()
                if isinstance(result, FileResponse):
                    self.send_response(200)
                    self.send_header("Content-Type", result.content_type)
                    self.send_header("Content-Disposition", f'attachment; filename="{result.filename}"')
                    self.send_header("Content-Length", str(len(result.data)))
                    self.end_headers()
                    self.wfile.write(result.data)
                    return True
                data = json.dumps(result, ensure_ascii=False).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return True
        return False

    def do_GET(self):
        if self.path.startswith("/api/"):
            if not self._api("GET"):
                self.send_error(404)
        else:
            super().do_GET()

    def do_POST(self):
        if not self._api("POST"):
            self.send_error(404)

    def do_PUT(self):
        if not self._api("PUT"):
            self.send_error(404)

    def do_DELETE(self):
        if not self._api("DELETE"):
            self.send_error(404)


def create_server(port=PORT):
    """Prepara o banco e cria o servidor. port=0 escolhe uma porta livre automaticamente."""
    init_db()
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    server = create_server()
    print(f"Subtil Corretora rodando em http://localhost:{PORT}  (Ctrl+C para parar)")
    print(f"Banco de dados: {DB_PATH}")
    server.serve_forever()
