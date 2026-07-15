"""Parse a Tally company archive (ZIP) into a single TallyData.

A "whole company" export may be a ZIP containing:
  * Tally XML export file(s) (``.xml`` / ``.txt``)
  * Tally Excel export file(s) (``.xlsx``)
  * A raw Tally company folder (``Manager.1800`` / ``Tally.200`` / ``*.idx`` …),
    possibly nested (e.g. ``100000/Manager.1800``)

All contained files are parsed and merged into one ``TallyData`` so the rest of
the import pipeline (preview / confirm / undo) is reused unchanged.
"""
from __future__ import annotations

import io
import os
import tempfile
import zipfile
from dataclasses import dataclass, field

from app.services.tally_parser import TallyData, parse_tally_xml, parse_tally_excel
from app.services import tally_binary


def _merge_into(target: TallyData, src: TallyData) -> None:
    existing_groups = {g.name for g in target.groups}
    existing_ledgers = {l.name for l in target.ledgers}
    existing_parties = {p.name for p in target.parties}
    existing_sg = {s.name for s in target.stock_groups}
    existing_si = {s.name for s in target.stock_items}
    existing_vch = {(v.voucher_type, v.voucher_number) for v in target.vouchers}

    for g in src.groups:
        if g.name not in existing_groups:
            target.groups.append(g); existing_groups.add(g.name)
    for l in src.ledgers:
        if l.name not in existing_ledgers:
            target.ledgers.append(l); existing_ledgers.add(l.name)
    for p in src.parties:
        if p.name not in existing_parties:
            target.parties.append(p); existing_parties.add(p.name)
    for s in src.stock_groups:
        if s.name not in existing_sg:
            target.stock_groups.append(s); existing_sg.add(s.name)
    for s in src.stock_items:
        if s.name not in existing_si:
            target.stock_items.append(s); existing_si.add(s.name)
    for v in src.vouchers:
        key = (v.voucher_type, v.voucher_number)
        if key not in existing_vch:
            target.vouchers.append(v); existing_vch.add(key)


def _is_binary_data(name: str) -> bool:
    low = name.lower()
    return (low.endswith(".1800") or low.endswith(".200") or low.endswith(".900")
            or low == "tallyprimedata" or low.endswith(".idx"))


def _decode_bytes(data: bytes) -> str:
    """Decode bytes as text, auto-detecting Tally's UTF-16 (BOM) vs UTF-8/UTF-8-SIG."""
    for enc in ("utf-16", "utf-8-sig", "utf-8", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", "replace")


def _read_text(path: str) -> str:
    with open(path, "rb") as fh:
        return _decode_bytes(fh.read())


def parse_tally_archive(content: bytes) -> TallyData:
    """Parse a ZIP archive of Tally export files / raw company folder."""
    result = TallyData()
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            zf.extractall(tmp)

        for root, _dirs, files in os.walk(tmp):
            for fname in sorted(files):
                path = os.path.join(root, fname)
                low = fname.lower()
                try:
                    if low.endswith(".xml") or low.endswith(".txt"):
                        _merge_into(result, parse_tally_xml(_read_text(path)))
                    elif low.endswith(".xlsx"):
                        with open(path, "rb") as fh:
                            _merge_into(result, parse_tally_excel(fh.read()))
                    elif _is_binary_data(fname):
                        continue  # handled below via folder scan
                except Exception:
                    # Skip files we cannot parse rather than aborting the whole archive
                    continue

        # Binary company folders: scan the whole extracted tree for data files.
        if any(_is_binary_data(os.path.join(r, f)) for r, _, fs in os.walk(tmp) for f in fs):
            _merge_into(result, tally_binary.read_tally_company(tmp))

    return result
