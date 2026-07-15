"""Regression tests for the raw Tally binary chart-of-accounts reader.

These build synthetic ``.1800`` files using the markers discovered in
``tally_binary`` (object containers ``02 10 03 00 00 <len2> <utf-16 name>``,
value strings ``02 10 02 00 00 0f <len2> <utf-16>``) and assert that
``read_tally_company`` extracts groups + ledgers (with parent linkage) and
filters Tally-internal noise.
"""
from __future__ import annotations

import os
import struct

from app.services.tally_binary import OBJ, VAL, STANDARD_GROUPS, read_tally_company


def _u16(s: str) -> bytes:
    return s.encode("utf-16-le")


def _value(child: str) -> bytes:
    body = _u16(child) + b"\x00\x00"
    return VAL + struct.pack("<H", len(body)) + body


def _container(name: str, children=()) -> bytes:
    name_body = _u16(name) + b"\x00\x00"
    inner = b"".join(_value(c) for c in children)
    body = b"\x00" + name_body + inner  # leading 0x00 flag byte (seen in real files)
    return OBJ + struct.pack("<H", len(body)) + body


def _write_company(tmp_path, *containers: bytes) -> str:
    folder = os.path.join(str(tmp_path), "100000")
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "Manager.1800"), "wb") as f:
        f.write(b"".join(containers))
    return folder


def test_extracts_groups_and_ledgers_with_parent_linkage(tmp_path):
    folder = _write_company(
        tmp_path,
        _container("Bank Accounts", ["HDFC A/C", "SBI Current A/C"]),
        _container("Sundry Debtors", ["M/s Grace Nursing Home"]),
        _container("My Custom Group", ["Test Party A/C"]),
    )
    result = read_tally_company(folder)

    group_names = {g.name for g in result.groups}
    ledger_names = {l.name for l in result.ledgers}
    ledger_by_name = {l.name: l for l in result.ledgers}

    # standard groups are always seeded
    assert "Bank Accounts" in group_names
    assert len(group_names) >= len(STANDARD_GROUPS)

    # custom group is captured
    assert "My Custom Group" in group_names

    # ledgers extracted and linked to the correct parent group
    assert "HDFC A/C" in ledger_names
    assert ledger_by_name["HDFC A/C"].group_name == "Bank Accounts"
    assert "M/s Grace Nursing Home" in ledger_names
    assert ledger_by_name["M/s Grace Nursing Home"].group_name == "Sundry Debtors"
    assert ledger_by_name["Test Party A/C"].group_name == "My Custom Group"


def test_filters_tally_internal_noise(tmp_path):
    folder = _write_company(
        tmp_path,
        _container("Bank Accounts", ["HDFC A/C"]),
        # internal objects that must NOT become groups/ledgers
        _container("12345678-1234-1234-1234-123456789abc"),  # GUID
        _container("5LtxunQe8aIaH1w5"),                       # base62 object id
        _container("Opening Balance", ["Default"]),            # noise tokens
        _container("Duties & Taxes", ["CGST Slab", "AGAPE ACTS"]),  # slab + company-name leak
    )
    result = read_tally_company(folder)

    group_names = {g.name for g in result.groups}
    ledger_names = {l.name for l in result.ledgers}

    # GUIDs and base62 ids are not groups
    assert "12345678-1234-1234-1234-123456789abc" not in group_names
    assert "5LtxunQe8aIaH1w5" not in group_names

    # pure noise tokens are dropped
    assert "Opening Balance" not in group_names
    assert "Default" not in ledger_names

    # tax slabs and company-name leaks are not ledgers
    assert "CGST Slab" not in ledger_names
    assert "AGAPE ACTS" not in ledger_names

    # real ledger still present
    assert "HDFC A/C" in ledger_names


def test_no_vouchers_or_stock_from_binary(tmp_path):
    folder = _write_company(
        tmp_path,
        _container("Bank Accounts", ["HDFC A/C"]),
    )
    result = read_tally_company(folder)
    assert result.vouchers == []
    assert result.stock_items == []
    assert result.parties == []
