"""License plate text normalization helpers."""

from __future__ import annotations

import re


VN_COMPACT_PLATE_PATTERN = re.compile(r"\d{2}[A-Z]{1,2}\d{4,6}")
MOVED_SERIAL_PREFIX_PATTERN = re.compile(r"^(\d)(\d{2}[A-Z]{1,2})(\d{4})$")


def _compact_alnum(value: str) -> str:
    return "".join(char for char in value.strip().upper() if char.isalnum())


def _repair_compact_plate(value: str) -> str:
    moved_serial_prefix = MOVED_SERIAL_PREFIX_PATTERN.match(value)
    if moved_serial_prefix:
        serial_prefix, plate_prefix, serial_tail = moved_serial_prefix.groups()
        return f"{plate_prefix}{serial_prefix}{serial_tail}"

    match = VN_COMPACT_PLATE_PATTERN.search(value)
    if match:
        return match.group(0)
    return value


def normalize_license_plate(value: str) -> str:
    """Normalize OCR text to a readable Vietnamese plate format."""
    compact = _repair_compact_plate(_compact_alnum(value))
    if not compact:
        return "UNKNOWN"

    if (
        len(compact) >= 7
        and compact[:2].isdigit()
        and compact[2].isalpha()
        and compact[3:].isdigit()
    ):
        province = compact[:2]
        letter = compact[2]
        number_part = compact[3:]

        if len(number_part) in {4, 5}:
            return f"{province}{letter}-{number_part}"

        if len(number_part) >= 6:
            return f"{province}{letter}{number_part[0]}-{number_part[1:]}"

    return compact


def normalize_license_plate_compact(value: str) -> str:
    """Normalize OCR text to uppercase letters/digits only."""
    compact = _repair_compact_plate(_compact_alnum(value))
    return compact or "UNKNOWN"
