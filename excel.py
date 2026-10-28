"""
Gerador mínimo de planilhas .xlsx usando só a biblioteca padrão (zipfile + XML).
Uso:
    wb = Workbook()
    ws = wb.sheet("Nome", widths=[30, 12])
    ws.row([Cell("Título", "title")])
    ws.row(["texto", 12.5, date(2026, 1, 1), Cell("=SUM(B2:B3)", "money_bold")])
    data = wb.to_bytes()
"""
import io
import zipfile
from datetime import date
from xml.sax.saxutils import escape

# índice de cada estilo dentro de <cellXfs> (veja STYLES_XML)
STYLE = {
    None: 0, "header": 1, "money": 2, "pct": 3, "date": 4, "money_bold": 5,
    "bold": 6, "pct_bold": 7, "title": 8, "muted": 9, "int": 10, "int_bold": 11,
}

STYLES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/>
    <numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><color rgb="FF0F5C4D"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF6B7A75"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F5C4D"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE3EDE8"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top style="thin"><color rgb="FF0F5C4D"/></top><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="12">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="10" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="1" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>"""


class Cell:
    def __init__(self, value, style=None):
        self.value, self.style = value, style


def col_letter(i):
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def excel_date(d):
    return (d - date(1899, 12, 30)).days


class Sheet:
    def __init__(self, name, widths=None, freeze_row=None):
        self.name = name[:31]
        self.widths = widths or []
        self.freeze_row = freeze_row  # congela as linhas acima desta (1-based)
        self.rows = []

    def row(self, values=()):
        self.rows.append(list(values))
        return len(self.rows)  # número da linha (1-based), útil para fórmulas

    def _cell_xml(self, ref, v):
        style = None
        if isinstance(v, Cell):
            v, style = v.value, v.style
        if v is None or v == "":
            return f'<c r="{ref}" s="{STYLE[style]}"/>' if style else ""
        if isinstance(v, date):
            return f'<c r="{ref}" s="{STYLE[style or "date"]}"><v>{excel_date(v)}</v></c>'
        if isinstance(v, bool):
            v = "Sim" if v else "Não"
        if isinstance(v, (int, float)):
            return f'<c r="{ref}" s="{STYLE[style]}"><v>{v}</v></c>'
        v = str(v)
        if v.startswith("="):
            return f'<c r="{ref}" s="{STYLE[style]}"><f>{escape(v[1:])}</f></c>'
        return f'<c r="{ref}" s="{STYLE[style]}" t="inlineStr"><is><t xml:space="preserve">{escape(v)}</t></is></c>'

    def to_xml(self):
        out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
               '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">']
        if self.freeze_row:
            out.append(f'<sheetViews><sheetView workbookViewId="0"><pane ySplit="{self.freeze_row - 1}" '
                       f'topLeftCell="A{self.freeze_row}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>')
        if self.widths:
            out.append("<cols>" + "".join(
                f'<col min="{i + 1}" max="{i + 1}" width="{w}" customWidth="1"/>' for i, w in enumerate(self.widths)) + "</cols>")
        out.append("<sheetData>")
        for r, values in enumerate(self.rows, start=1):
            cells = "".join(self._cell_xml(f"{col_letter(c)}{r}", v) for c, v in enumerate(values))
            out.append(f'<row r="{r}">{cells}</row>')
        out.append("</sheetData></worksheet>")
        return "".join(out)


class Workbook:
    def __init__(self):
        self.sheets = []

    def sheet(self, name, **kw):
        s = Sheet(name, **kw)
        self.sheets.append(s)
        return s

    def to_bytes(self):
        n = len(self.sheets)
        content_types = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                      for i in range(1, n + 1))
            + "</Types>"
        )
        rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        )
        workbook = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
            + "".join(f'<sheet name="{escape(s.name)}" sheetId="{i}" r:id="rId{i}"/>' for i, s in enumerate(self.sheets, start=1))
            + "</sheets></workbook>"
        )
        wb_rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
                      for i in range(1, n + 1))
            + f'<Relationship Id="rId{n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            "</Relationships>"
        )
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", content_types)
            z.writestr("_rels/.rels", rels)
            z.writestr("xl/workbook.xml", workbook)
            z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
            z.writestr("xl/styles.xml", STYLES_XML)
            for i, s in enumerate(self.sheets, start=1):
                z.writestr(f"xl/worksheets/sheet{i}.xml", s.to_xml())
        return buf.getvalue()
