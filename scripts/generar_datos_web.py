"""Convierte el CSV consolidado en el JSON mínimo utilizado por GitHub Pages."""

from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "consolidado_padel.csv"
OUTPUT = ROOT / "docs" / "data" / "events.json"


def clean(value: object) -> str:
    return "" if value is None else str(value).strip()


def read_text(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("No fue posible interpretar la codificación del CSV")


def normalize_date(value: str) -> str:
    value = clean(value)
    if not value:
        return ""

    candidates = (
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%Y%m%d",
        "%d.%m.%Y",
    )
    short_value = value[:10]
    for candidate in (value, short_value):
        for date_format in candidates:
            try:
                return datetime.strptime(candidate, date_format).date().isoformat()
            except ValueError:
                pass
    return value


def split_duo(value: str) -> list[str]:
    value = clean(value)
    if not value:
        return []
    parts = re.split(r"\s*(?:/|&|\+|\by\b)\s*", value, flags=re.IGNORECASE)
    return [part.strip() for part in parts if part.strip()]


def canonical_columns(fieldnames: list[str]) -> dict[str, str]:
    return {clean(column).lower(): column for column in fieldnames if column}


def get(row: dict[str, str], columns: dict[str, str], *names: str) -> str:
    for name in names:
        original = columns.get(name.lower())
        if original is not None:
            return clean(row.get(original, ""))
    return ""


def participants(row: dict[str, str], columns: dict[str, str]) -> list[str]:
    values = [
        get(row, columns, "reves_1", "revés_1"),
        get(row, columns, "drive_1"),
        get(row, columns, "reves_2", "revés_2"),
        get(row, columns, "drive_2"),
    ]
    result = [value for value in values if value]
    if result:
        return list(dict.fromkeys(result))

    result = [
        *split_duo(get(row, columns, "dupla_1")),
        *split_duo(get(row, columns, "dupla_2")),
    ]
    return list(dict.fromkeys(result))


def normalize_point_type(value: str) -> str:
    key = clean(value).lower().replace("_", " ")
    return "Key Point" if key in {"key point", "key points"} else "Regular Point"


def convert() -> dict[str, object]:
    if not INPUT.exists():
        raise FileNotFoundError(f"No existe el archivo requerido: {INPUT}")

    text = read_text(INPUT)
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ";" if sample.count(";") > sample.count(",") else ","

    reader = csv.DictReader(text.splitlines(), delimiter=delimiter)
    if not reader.fieldnames:
        raise ValueError("El CSV no contiene encabezados")

    columns = canonical_columns(reader.fieldnames)
    required = ["player", "event_type", "shot_type"]
    missing = [name for name in required if name not in columns]
    if "set" not in columns:
        missing.append("set")
    if not ({"fecha", "match_date"} & set(columns)):
        missing.append("fecha o match_date")
    if missing:
        raise ValueError("Faltan columnas: " + ", ".join(missing))

    events: list[dict[str, object]] = []
    all_players: set[str] = set()

    for row_number, row in enumerate(reader, start=1):
        date = normalize_date(get(row, columns, "fecha", "match_date"))
        match = get(row, columns, "partido", "match_id") or f"Partido {row_number}"
        event_participants = participants(row, columns)
        player = get(row, columns, "player")
        forced_by = get(row, columns, "forced_by_player")

        all_players.update(event_participants)
        if player:
            all_players.add(player)
        if forced_by:
            all_players.add(forced_by)

        events.append({
            "date": date,
            "match": match,
            "participants": event_participants,
            "player": player,
            "forcedBy": forced_by,
            "eventType": get(row, columns, "event_type"),
            "shotType": get(row, columns, "shot_type") or "Sin golpe",
            "pointType": normalize_point_type(get(row, columns, "point_type")),
            "set": get(row, columns, "set") or "Sin set",
        })

    if not events:
        raise ValueError("El CSV no contiene registros")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": INPUT.name,
        "isDemo": all(name.startswith("Jugador Demo") for name in all_players),
        "formula": {"winner": 4, "provokedError": 3, "forcedError": -2, "unforcedError": -5},
        "players": sorted(all_players, key=str.casefold),
        "events": events,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return payload


if __name__ == "__main__":
    result = convert()
    print(
        f"Generado {OUTPUT.relative_to(ROOT)}: "
        f"{len(result['events'])} eventos, {len(result['players'])} jugadores"
    )

