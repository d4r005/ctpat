"""
Bloque de funciones para el reporte de correo.
Este archivo se copia al servidor al hacer el patch de server.py.
"""

# ── Puntos de inspección (espejo de inspectionPoints.ts) ────────────────────
_POINTS_19 = [
    (1,"Defensa","保险杠"),(2,"Motor","发动机"),(3,"Neumáticos","轮胎"),
    (4,"Piso exterior e Interior de tractor","牵引车内外地板"),
    (5,"Tanque de combustible","油箱"),(6,"Cabina","驾驶室"),
    (7,"Tanque de aire","储气罐"),(8,"Ejes","车轴"),(9,"Quinta rueda","第五轮"),
    (10,"Por debajo de unidad","单位底部"),
    (11,"Exterior e interior de puertas (bisagras, uniones)","车门内外（合页、连接处）"),
    (12,"Piso interior","内地板"),(13,"Paredes laterales","侧壁"),
    (14,"Pared frontal","前壁"),(15,"Techo interior","内顶棚"),
    (16,"Unidad de refrigeración","制冷装置"),(17,"Escape","排气管"),
    (18,"Inspección Sellos VVTT","VVTT 封条检查"),
    (19,"Inspección agrícola","农业检查"),
]
_POINTS_9 = [
    (1,"Pared frontal","前壁"),(2,"Lateral izquierdo","左侧壁"),
    (3,"Lateral derecho","右侧壁"),(4,"Piso (Suelo)","地板"),
    (5,"Techo","顶棚"),(6,"Puertas (Interior/Exterior)","车门（内外）"),
    (7,"Fuera tren de rodaje / Chasis","底盘/车架"),
    (8,"Inspección Sellos VVTT","VVTT 封条检查"),
    (9,"Inspección agrícola","农业检查"),
]
_POINT_MAP_ALL = {n: (es, zh) for n, es, zh in _POINTS_19 + _POINTS_9}
