"""License plate text normalization helpers."""

from __future__ import annotations


def normalize_license_plate(value: str) -> str:
    """Normalize OCR text to a readable Vietnamese plate format."""
    compact = "".join(char for char in value.strip().upper() if char.isalnum())
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
