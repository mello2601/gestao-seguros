"""
Regras de validação dos cadastros (a interface tem regras equivalentes em app.js para avisar na hora).
Cada função levanta CampoInvalido(campo, mensagem) quando encontra um erro que impede salvar.
"""
import re
import unicodedata
from datetime import date


class CampoInvalido(Exception):
    def __init__(self, campo, mensagem, status=400, **extra):
        super().__init__(mensagem)
        self.campo, self.status, self.extra = campo, status, extra


def so_digitos(texto):
    return re.sub(r"\D", "", str(texto or ""))


def sem_acento(texto):
    """'Porto  Seguro ' -> 'porto seguro' (para comparar nomes sem diferenciar acento/maiúscula/espaços)."""
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return " ".join(t.lower().split())


MINUSCULAS = {"da", "das", "de", "do", "dos", "e", "di", "du"}


def capitalizar_nome(nome):
    """Só ajusta nomes digitados todo em minúsculas ou todo em MAIÚSCULAS: 'JOÃO DA SILVA' -> 'João da Silva'."""
    if nome != nome.lower() and nome != nome.upper():
        return nome  # o usuário escolheu a grafia (ex.: 'McDonald', 'XP Seguros'), mantém
    palavras = nome.lower().split()
    return " ".join(p if i and p in MINUSCULAS else p[:1].upper() + p[1:] for i, p in enumerate(palavras))


def limpar_texto(texto):
    """Remove espaços nas pontas e espaços duplos no meio."""
    return " ".join(str(texto or "").split()) or None


# ------------------------------------------------------------ CPF / CNPJ

def cpf_valido(cpf):
    d = so_digitos(cpf)
    if len(d) != 11 or d == d[0] * 11:
        return False
    for n in (9, 10):
        soma = sum(int(d[i]) * (n + 1 - i) for i in range(n))
        if (soma * 10 % 11) % 10 != int(d[n]):
            return False
    return True


def cnpj_valido(cnpj):
    d = so_digitos(cnpj)
    if len(d) != 14 or d == d[0] * 14:
        return False
    for n in (12, 13):
        pesos = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] if n == 12 else [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        resto = sum(int(d[i]) * pesos[i] for i in range(n)) % 11
        if (0 if resto < 2 else 11 - resto) != int(d[n]):
            return False
    return True


def formatar_documento(texto):
    """Padroniza CPF (000.000.000-00) e CNPJ (00.000.000/0000-00); outros valores ficam como vieram."""
    d = so_digitos(texto)
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return limpar_texto(texto)


# ------------------------------------------------------------ contato

def digitos_telefone(texto):
    d = so_digitos(texto)
    if len(d) in (12, 13) and d.startswith("55"):  # remove o código do Brasil (+55)
        d = d[2:]
    return d


def formatar_telefone(texto):
    d = digitos_telefone(texto)
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return limpar_texto(texto)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


# ------------------------------------------------------------ números e datas

def numero(valor, campo, rotulo, minimo=0, maximo=None):
    """Aceita 2850.5, '2850.50' ou '2.850,50'. Vazio vira 0."""
    if valor in (None, ""):
        return 0.0
    if isinstance(valor, (int, float)):
        n = float(valor)
    else:
        s = str(valor).replace("R$", "").replace(" ", "")
        if "," in s:
            s = s.replace(".", "").replace(",", ".")
        try:
            n = float(s)
        except ValueError:
            raise CampoInvalido(campo, f"{rotulo}: valor inválido")
    if n < minimo:
        raise CampoInvalido(campo, f"{rotulo} não pode ser negativo" if minimo == 0 else f"{rotulo} deve ser no mínimo {minimo}")
    if maximo is not None and n > maximo:
        raise CampoInvalido(campo, f"{rotulo} deve ser no máximo {maximo:g}")
    return round(n, 2)


def data(valor, campo, rotulo, ano_min=1990, ano_max=2100, obrigatoria=True):
    if not valor:
        if obrigatoria:
            raise CampoInvalido(campo, f"Informe a data de {rotulo}")
        return None
    try:
        d = date.fromisoformat(str(valor))
    except ValueError:
        raise CampoInvalido(campo, f"Data de {rotulo} inválida")
    if not (ano_min <= d.year <= ano_max):
        raise CampoInvalido(campo, f"Data de {rotulo} com ano {d.year} fora do esperado. Confira a digitação")
    return d


# ------------------------------------------------------------ cadastros

def validar_segurado(body, documento_anterior=None):
    """Limpa e valida os campos do segurado (altera body). documento_anterior: CPF/CNPJ já salvo, se for edição."""
    nome = limpar_texto(body.get("nome"))
    if not nome or len(nome) < 3 or not re.search(r"[^\W\d_]", nome):
        raise CampoInvalido("nome", "Informe o nome completo ou a razão social")
    body["nome"] = capitalizar_nome(nome)

    doc = so_digitos(body.get("documento"))
    if doc:
        if len(doc) not in (11, 14):
            raise CampoInvalido("documento", "CPF tem 11 dígitos e CNPJ tem 14. Confira a digitação")
        valido = cpf_valido(doc) if len(doc) == 11 else cnpj_valido(doc)
        # cadastros antigos com documento inválido continuam editáveis enquanto o documento não for alterado
        if not valido and doc != so_digitos(documento_anterior):
            raise CampoInvalido("documento", f"{'CPF' if len(doc) == 11 else 'CNPJ'} inválido: os dígitos verificadores não conferem")
    elif str(body.get("documento") or "").strip():
        raise CampoInvalido("documento", "CPF/CNPJ deve conter números")
    body["documento"] = formatar_documento(body.get("documento"))

    email = (body.get("email") or "").strip().lower()
    if email and not EMAIL_RE.match(email):
        raise CampoInvalido("email", "E-mail incompleto. Exemplo: nome@email.com")
    body["email"] = email or None

    if str(body.get("telefone") or "").strip():
        tel = digitos_telefone(body["telefone"])
        if len(tel) not in (10, 11):
            raise CampoInvalido("telefone", "Telefone deve ter DDD + número: (11) 98765-4321 ou (11) 3333-4444")
        if int(tel[:2]) < 11:
            raise CampoInvalido("telefone", f"DDD {tel[:2]} não existe")
        if len(tel) == 11 and tel[2] != "9":
            raise CampoInvalido("telefone", "Celular com 11 dígitos deve ter 9 logo após o DDD")
    body["telefone"] = formatar_telefone(body.get("telefone"))

    nasc = data(body.get("data_nascimento"), "data_nascimento", "nascimento", ano_min=1900, obrigatoria=False)
    if nasc and nasc > date.today():
        raise CampoInvalido("data_nascimento", "A data de nascimento não pode estar no futuro")
    body["data_nascimento"] = nasc.isoformat() if nasc else None

    for campo in ("endereco", "cidade"):
        body[campo] = limpar_texto(body.get(campo))
    return body


def validar_apolice(body, seguradoras_existentes=()):
    """Limpa e valida os campos da apólice (altera body)."""
    for campo, rotulo in (("segurado_id", "o segurado"), ("tipo_id", "o tipo de seguro")):
        if not str(body.get(campo) or "").strip():
            raise CampoInvalido(campo, f"Selecione {rotulo}")

    num = limpar_texto(body.get("numero"))
    if not num or len(num) < 3:
        raise CampoInvalido("numero", "Informe o número da apólice (mínimo 3 caracteres)")
    body["numero"] = num

    cia = limpar_texto(body.get("seguradora"))
    if not cia or len(cia) < 2:
        raise CampoInvalido("seguradora", "Informe a seguradora")
    # usa a grafia já cadastrada quando o nome é o mesmo (ex.: "porto seguro" -> "Porto Seguro")
    body["seguradora"] = next((s for s in seguradoras_existentes if sem_acento(s) == sem_acento(cia)), cia)

    ini = data(body.get("data_inicio"), "data_inicio", "início")
    fim = data(body.get("data_fim"), "data_fim", "fim")
    if fim <= ini:
        raise CampoInvalido("data_fim", "O fim da vigência deve ser depois do início")
    if (fim - ini).days > 3660:
        raise CampoInvalido("data_fim", "Vigência acima de 10 anos. Confira o ano digitado")
    body["data_inicio"], body["data_fim"] = ini.isoformat(), fim.isoformat()

    body["premio"] = numero(body.get("premio"), "premio", "Prêmio")
    body["importancia_segurada"] = numero(body.get("importancia_segurada"), "importancia_segurada", "Importância segurada")
    body["comissao_pct"] = numero(body.get("comissao_pct"), "comissao_pct", "Comissão", 0, 100)

    body.setdefault("situacao", "ativa")
    if body["situacao"] not in ("ativa", "renovada", "cancelada"):
        raise CampoInvalido("situacao", "Situação inválida")
    for campo in ("bem_segurado", "forma_pagamento"):
        body[campo] = limpar_texto(body.get(campo))
    return body


def validar_tipo(body, nomes_existentes=()):
    nome = limpar_texto(body.get("nome"))
    if not nome or len(nome) < 3:
        raise CampoInvalido("nome", "Informe o nome do tipo de seguro (mínimo 3 letras)")
    igual = next((n for n in nomes_existentes if sem_acento(n) == sem_acento(nome)), None)
    if igual:
        raise CampoInvalido("nome", f"Já existe o tipo \"{igual}\"", status=409)
    body["nome"] = nome
    return body
