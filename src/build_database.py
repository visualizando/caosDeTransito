#!/usr/bin/env python3
"""
Pipeline de datos: Caos de Tránsito CABA
Lee fuentes raw (XLS/XLSX/CSV), normaliza, valida y exporta a SQLite + CSV/JSON.
"""
import os, sys, json, sqlite3, hashlib, warnings
from pathlib import Path
from datetime import datetime
import pandas as pd
import numpy as np
import xlrd
import openpyxl

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
PROC.mkdir(parents=True, exist_ok=True)

DB_PATH = PROC / "caos_transito.sqlite"
REPORT_PATH = PROC / "reporte_calidad.json"

with open(ROOT / "config" / "sources.json", encoding="utf-8") as f:
    CONFIG = json.load(f)

CODE_CATS = CONFIG["code_categories"]
MOTIVO_MAP = CONFIG["motivo_acarreo_map"]
MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"]
MES_NUM = {m:i+1 for i,m in enumerate(MESES)}


def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


# ============================================================
# 1. INFRACCIONES MENSUALES (10 archivos XLS)
# ============================================================
def read_infracciones_xls(path, year):
    wb = xlrd.open_workbook(path)
    sh = wb.sheet_by_index(0)
    hdr = None
    for r in range(sh.nrows):
        if str(sh.cell_value(r,1)).strip() == "COD":
            hdr = r; break
    if hdr is None:
        raise ValueError(f"No header row found in {path}")
    rows = []
    for r in range(hdr+1, sh.nrows):
        cod = str(sh.cell_value(r,1)).strip()
        if not cod or cod.upper() == "TOTALES GENERALES":
            continue
        desc = str(sh.cell_value(r,2)).strip()
        vals = {}
        for i, m in enumerate(MESES):
            v = sh.cell_value(r, 3+i)
            vals[m] = int(v) if v else 0
        total = int(sh.cell_value(r,15)) if sh.cell_value(r,15) else sum(vals.values())
        rows.append({
            "anio": year, "codigo": cod, "descripcion": desc, "total": total, **vals
        })
    return pd.DataFrame(rows)


def assign_categoria(row):
    cod = row["codigo"]
    for cat, codes in CODE_CATS.items():
        if cod in codes:
            return cat
    if cod.startswith("65"): return "velocidad"
    if cod.startswith("69"): return "estacionamiento"
    if cod.startswith("7"): return "alcohol_otros"
    return "otras"


def process_infracciones():
    log("Procesando infracciones 2016-2025...")
    all_dfs = []
    for src in CONFIG["sources"]:
        if src["type"] != "infracciones_mensuales":
            continue
        path = RAW / src["file"]
        df = read_infracciones_xls(path, src["year"])
        df["fuente"] = src["id"]
        all_dfs.append(df)
    df = pd.concat(all_dfs, ignore_index=True)
    df["categoria"] = df.apply(assign_categoria, axis=1)
    log(f"  {len(df)} filas, {df['anio'].nunique()} años, {df['codigo'].nunique()} códigos")
    return df


# ============================================================
# 2. ACTAS PROCESADAS (fotos vs manuales)
# ============================================================
def process_actas_procesadas():
    log("Procesando actas procesadas...")
    path = RAW / "ESTADISTICA ACTAS PROCESADAS 2016-2025.xlsx"
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb["Hoja1"]
    rows = []
    current_year = None
    for row in ws.iter_rows(values_only=True):
        if row[0] is None:
            continue
        val0 = str(row[0]).strip()
        if val0.isdigit() and len(val0)==4 and int(val0)>=2016:
            current_year = int(val0)
            continue
        if val0 in ("Rubros"," Mes","Total"):
            continue
        if isinstance(row[0], int) and 1 <= row[0] <= 12 and current_year:
            rows.append({
                "anio": current_year, "mes": row[0],
                "fotos": int(row[1]) if row[1] else 0,
                "manuales": int(row[2]) if row[2] else 0,
                "total": int(row[3]) if row[3] else (int(row[1] or 0) + int(row[2] or 0))
            })
    df = pd.DataFrame(rows)
    log(f"  {len(df)} filas mensuales")
    return df


# ============================================================
# 3. ACTAS RESUELTAS
# ============================================================
def process_actas_resueltas():
    log("Procesando actas resueltas...")
    path = RAW / "ACTAS RESUELTAS 2018-2025.xlsx"
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb["2021"]
    rows = []
    current_year = None
    meses_map = {"ENERO":1,"FEBRERO":2,"MARZO":3,"ABRIL":4,"MAYO":5,"JUNIO":6,
                 "JULIO":7,"AGOSTO":8,"SETIEMBRE":9,"OCTUBRE":10,"NOVIEMBRE":11,"DICIEMBRE":12}
    for row in ws.iter_rows(values_only=True):
        if row[0] is None:
            continue
        val0 = str(row[0]).strip()
        if "TOTAL RESOLUCIONES POR ACTAS" in val0:
            current_year = int(val0.split()[-1])
            continue
        if val0 == "Actas Resueltas Tránsito" and current_year:
            for m_name, m_num in meses_map.items():
                idx = list(meses_map.keys()).index(m_name) + 1
                if idx < len(row) and row[idx] is not None:
                    rows.append({"anio": current_year, "mes": m_num, "resueltas": int(row[idx])})
    df = pd.DataFrame(rows)
    log(f"  {len(df)} filas mensuales")
    return df


# ============================================================
# 4. ACARREOS (Playas Propias)
# ============================================================
def process_acarreos():
    log("Procesando acarreos...")
    path = RAW / "Playas Propias.xlsx"
    df = pd.read_excel(path, sheet_name="DATOS")
    df.columns = ["playa", "tipo_vehic", "fecha_ingreso", "motivo", "lugar_remision", "comuna"]
    df["comuna"] = df["comuna"].astype(str)
    df["anio"] = df["fecha_ingreso"].dt.year
    df["mes"] = df["fecha_ingreso"].dt.month
    df["motivo"] = df["motivo"].str.strip().str.upper()
    # Normalizar motivos combinados (ALCO / PLACA -> ALCOHOLEMIA)
    def norma_motivo(m):
        m = m.upper()
        if "ESTUP" in m: return "ESTUP EFACIENTES"
        for prim, tokens in [
            ("ALCOHOLEMIA", ["ALCO", "ALCOHOLEMIA"]),
            ("ESTUPE", ["ESTUP"]),
            ("DOCUMENTACION", ["DOC"]),
            ("PLACA", ["PLACA"]),
            ("UBER", ["UBER"]),
            ("ABANDONADO", ["ABANDONADO"]),
            ("ESTACIONAMIENTO", ["ESTACIONAMIENTO"]),
        ]:
            for t in tokens:
                if m.startswith(t):
                    return prim
        return "OTROS"
    df["motivo_norm"] = df["motivo"].apply(norma_motivo)
    df["playa"] = df["playa"].str.strip().str.title().str.replace("De","de").str.replace("Del","del").str.replace("Iv","IV")
    log(f"  {len(df)} registros, años {df['anio'].min()}-{df['anio'].max()}")
    return df


# ============================================================
# EXPORTACIONES Y SQLITE
# ============================================================
def export_all(inf, proc, res, arr):
    log("Exportando a SQLite...")
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=WAL")
    
    # Tablas principales
    inf.to_sql("infracciones_mensual", con, if_exists="replace", index=False)
    proc.to_sql("actas_procesadas_mensual", con, if_exists="replace", index=False)
    res.to_sql("actas_resueltas_mensual", con, if_exists="replace", index=False)
    arr.to_sql("acarreos", con, if_exists="replace", index=False)
    
    # Vistas agregadas anuales
    con.executescript("""
    CREATE VIEW IF NOT EXISTS v_infracciones_anual AS
    SELECT anio, categoria, SUM(total) as total
    FROM infracciones_mensual
    GROUP BY anio, categoria;
    
    CREATE VIEW IF NOT EXISTS v_infracciones_top_codigos AS
    SELECT anio, codigo, descripcion, categoria, SUM(total) as total
    FROM infracciones_mensual
    GROUP BY anio, codigo, descripcion, categoria;
    
    CREATE VIEW IF NOT EXISTS v_actas_procesadas_anual AS
    SELECT anio, SUM(fotos) as fotos, SUM(manuales) as manuales, SUM(total) as total
    FROM actas_procesadas_mensual
    GROUP BY anio;
    
    CREATE VIEW IF NOT EXISTS v_actas_resueltas_anual AS
    SELECT anio, SUM(resueltas) as resueltas
    FROM actas_resueltas_mensual
    GROUP BY anio;
    
    CREATE VIEW IF NOT EXISTS v_acarreos_anual AS
    SELECT anio, motivo_norm as motivo, COUNT(*) as count
    FROM acarreos
    GROUP BY anio, motivo_norm;
    
    CREATE VIEW IF NOT EXISTS v_kpis_anuales AS
    SELECT 
        i.anio,
        SUM(i.total) as infracciones_total,
        p.total as actas_procesadas,
        r.resueltas as actas_resueltas,
        COALESCE(a.cnt, 0) as acarreos,
        SUM(CASE WHEN i.categoria='alcohol' THEN i.total ELSE 0 END) as infracciones_alcohol,
        SUM(CASE WHEN i.categoria='velocidad' THEN i.total ELSE 0 END) as infracciones_velocidad,
        SUM(CASE WHEN i.categoria='estacionamiento' THEN i.total ELSE 0 END) as infracciones_estacionamiento,
        SUM(CASE WHEN i.categoria='peajes' THEN i.total ELSE 0 END) as infracciones_peaje
    FROM infracciones_mensual i
    LEFT JOIN v_actas_procesadas_anual p ON i.anio = p.anio
    LEFT JOIN v_actas_resueltas_anual r ON i.anio = r.anio
    LEFT JOIN (SELECT anio, COUNT(*) as cnt FROM acarreos GROUP BY anio) a ON i.anio = a.anio
    GROUP BY i.anio, p.total, r.resueltas, a.cnt
    ORDER BY i.anio;
    """)
    
    # Exportar CSVs para el frontend
    for name, df in [
        ("infracciones_mensual", inf),
        ("actas_procesadas_mensual", proc),
        ("actas_resueltas_mensual", res),
        ("acarreos", arr),
        ("infracciones_anual_categoria", pd.read_sql("SELECT * FROM v_infracciones_anual", con)),
        ("infracciones_top_codigos", pd.read_sql("SELECT * FROM v_infracciones_top_codigos", con)),
        ("actas_procesadas_anual", pd.read_sql("SELECT * FROM v_actas_procesadas_anual", con)),
        ("actas_resueltas_anual", pd.read_sql("SELECT * FROM v_actas_resueltas_anual", con)),
        ("acarreos_anual_motivo", pd.read_sql("SELECT * FROM v_acarreos_anual", con)),
        ("kpis_anuales", pd.read_sql("SELECT * FROM v_kpis_anuales", con)),
    ]:
        csv_path = PROC / f"{name}.csv"
        df.to_csv(csv_path, index=False)
        log(f"  CSV: {csv_path.name} ({len(df)} rows)")
    
    # JSON para D3 (formato compacto)
    def clean(records):
        """Reemplaza NaN/None con 0 preservando tipos numéricos."""
        out = []
        for rec in records:
            fixed = {}
            for k, v in rec.items():
                if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
                    fixed[k] = None
                else:
                    fixed[k] = v
            out.append(fixed)
        return out

    json_exports = {
        "kpis_anuales": clean(pd.read_sql("SELECT * FROM v_kpis_anuales", con).to_dict("records")),
        "infracciones_anual_categoria": clean(pd.read_sql("SELECT * FROM v_infracciones_anual", con).to_dict("records")),
        "infracciones_top20_2025": clean(pd.read_sql("""
            SELECT * FROM v_infracciones_top_codigos 
            WHERE anio = 2025 ORDER BY total DESC LIMIT 20
        """, con).to_dict("records")),
        "top_por_anio": clean(pd.read_sql("""
            SELECT anio, codigo, descripcion, categoria, total FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY anio ORDER BY total DESC) AS rn
                FROM v_infracciones_top_codigos
            ) WHERE rn <= 15 ORDER BY anio, rn
        """, con).to_dict("records")),
        "actas_procesadas_anual": clean(pd.read_sql("SELECT * FROM v_actas_procesadas_anual", con).to_dict("records")),
        "actas_resueltas_anual": clean(pd.read_sql("SELECT * FROM v_actas_resueltas_anual", con).to_dict("records")),
        "acarreos_anual_motivo": clean(pd.read_sql("SELECT * FROM v_acarreos_anual", con).to_dict("records")),
        "acarreos_mensual_motivo": clean(arr[arr["anio"]>=2024].groupby(["anio","mes","motivo_norm"]).size().reset_index(name="count").to_dict("records")),
        "acarreos_tipo_motivo": clean(arr[arr["anio"]>=2024].groupby(["anio","tipo_vehic","motivo_norm"]).size().reset_index(name="count").to_dict("records")),
        "acarreos_playa_motivo": clean(arr[arr["anio"]>=2024].groupby(["anio","playa","motivo_norm"]).size().reset_index(name="count").to_dict("records")),
        "alcohol_por_anio": clean(pd.read_sql("""
            SELECT anio, codigo, descripcion, total FROM v_infracciones_top_codigos
            WHERE codigo IN ('7462','7463','7464','7062')
            ORDER BY codigo, anio
        """, con).to_dict("records")),
        "codigos": clean(pd.read_sql("""
            SELECT codigo, descripcion, SUM(total) as total_total
            FROM v_infracciones_top_codigos
            GROUP BY codigo, descripcion
            ORDER BY total_total DESC
        """, con).to_dict("records")),
        "serie_por_codigo": clean(pd.read_sql("""
            SELECT codigo, anio, descripcion, categoria, total FROM v_infracciones_top_codigos ORDER BY codigo, anio
        """, con).to_dict("records")),
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "period": "2016-2025",
            "acarreos_period": "2024-2026",
            "sources": [s["id"] for s in CONFIG["sources"]]
        }
    }
    
    json_path = PROC / "data.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_exports, f, ensure_ascii=False, separators=(",", ":"))

    # copia para el frontend (raíz del repo, consumido por app.js)
    front_json = ROOT / "data" / "data.json"
    with open(front_json, "w", encoding="utf-8") as f:
        json.dump(json_exports, f, ensure_ascii=False, separators=(",", ":"))
    log(f"  JSON frontend: {front_json.name} ({front_json.stat().st_size/1024:.0f} KB)")

    con.close()
    return json_exports


def quality_report(inf, proc, res, arr, json_data):
    log("Generando reporte de calidad...")
    report = {
        "generated_at": datetime.now().isoformat(),
        "files": {},
        "counts": {
            "infracciones_rows": int(len(inf)),
            "infracciones_years": sorted(inf["anio"].unique().tolist()),
            "infracciones_codes": int(inf["codigo"].nunique()),
            "actas_procesadas_rows": int(len(proc)),
            "actas_resueltas_rows": int(len(res)),
            "acarreos_rows": int(len(arr)),
        },
        "checks": {}
    }
    
    for src in CONFIG["sources"]:
        path = RAW / src["file"]
        report["files"][src["id"]] = {
            "file": src["file"],
            "sha256": file_hash(path),
            "size_bytes": path.stat().st_size
        }
    
    # Checks
    kpis = pd.DataFrame(json_data["kpis_anuales"])
    report["checks"]["kpis_years"] = sorted(kpis["anio"].tolist())
    report["checks"]["infracciones_total_2025"] = int(kpis[kpis["anio"]==2025]["infracciones_total"].values[0]) if 2025 in kpis["anio"].values else None
    report["checks"]["tasa_resolucion_2025"] = float(kpis[kpis["anio"]==2025]["actas_resueltas"].values[0] / kpis[kpis["anio"]==2025]["actas_procesadas"].values[0]) if 2025 in kpis["anio"].values else None
    
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    log(f"  Reporte: {REPORT_PATH.name}")


def main():
    log("=== INICIO PIPELINE CAOS DE TRÁNSITO ===")
    inf = process_infracciones()
    proc = process_actas_procesadas()
    res = process_actas_resueltas()
    arr = process_acarreos()
    
    json_data = export_all(inf, proc, res, arr)
    quality_report(inf, proc, res, arr, json_data)
    
    log("=== PIPELINE COMPLETADO ===")
    log(f"DB: {DB_PATH}")
    log(f"JSON: {PROC/'data.json'}")
    log(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()