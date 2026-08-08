"""Integration tests for TDS/TCS endpoints and service."""
from __future__ import annotations

from tests.conftest import auth_header, create_company, register_user


def _setup_company(client, email: str):
    _, token = register_user(client, email)
    company = create_company(client, token)
    return company, token


def _create_bank_ledger(client, token, cid):
    group = client.post("/api/coa/groups", json={
        "name": "Bank Accounts", "nature": "assets", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()
    return client.post("/api/coa/ledgers", json={
        "name": "HDFC Bank", "group_id": group["id"],
        "opening_balance": 100000, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()


def _create_expense_ledger(client, token, cid):
    group = client.post("/api/coa/groups", json={
        "name": "Indirect Expenses", "nature": "expenses", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()
    return client.post("/api/coa/ledgers", json={
        "name": "Professional Fees", "group_id": group["id"],
        "opening_balance": 0, "opening_balance_type": "Dr",
    }, headers=auth_header(token, cid)).json()


def _create_tds_liability_ledger(client, token, cid):
    group = client.post("/api/coa/groups", json={
        "name": "Duties & Taxes", "nature": "liabilities", "group_type": "sub",
    }, headers=auth_header(token, cid)).json()
    return client.post("/api/coa/ledgers", json={
        "name": "TDS Payable", "group_id": group["id"],
        "opening_balance": 0, "opening_balance_type": "Cr",
    }, headers=auth_header(token, cid)).json()


def _create_party(client, token, cid):
    return client.post("/api/coa/parties", json={
        "name": "ABC Consultants", "party_type": "supplier",
    }, headers=auth_header(token, cid)).json()


class TestAggregateThresholdSections:
    """194Q/206C-1H: the ₹50L limit is cumulative per party per FY — TDS/TCS
    applies only to the incremental excess (TallyPrime parity)."""

    def _make_194q(self, db, company_id):
        from app.models.tds_tcs import TdsTcsSection
        section = TdsTcsSection(
            company_id=company_id, section_code="194Q",
            section_name="TDS on Purchase of Goods", tds_tcs_type="tds",
            rate=0.1, threshold_limit=5000000,
            buyer_turnover_threshold=100000000, is_active=True,
        )
        db.add(section)
        db.commit()
        db.refresh(section)
        return section

    def test_incremental_excess_below_threshold(self, db):
        from app.services.tds_tcs import calculate_tds_tcs
        from tests.conftest import create_db_company
        co = create_db_company(db, "TDS Agg 1")
        section = self._make_194q(db, co.id)

        # Aggregate 40L before, 60L after → 10L incremental excess
        result = calculate_tds_tcs(
            db, company_id=co.id, section_id=section.id, base_amount=2000000.0,
            aggregate_base_amount=6000000.0, previous_aggregate_base_amount=4000000.0,
        )
        assert result["is_applicable"] is True
        assert result["taxable_base"] == 1000000.0
        assert result["calculated_amount"] == 1000.0  # 10L @ 0.1%

    def test_no_tds_while_aggregate_below_limit(self, db):
        from app.services.tds_tcs import calculate_tds_tcs
        from tests.conftest import create_db_company
        co = create_db_company(db, "TDS Agg 2")
        section = self._make_194q(db, co.id)

        result = calculate_tds_tcs(
            db, company_id=co.id, section_id=section.id, base_amount=3000000.0,
            aggregate_base_amount=3000000.0, previous_aggregate_base_amount=0.0,
        )
        assert result["is_applicable"] is False
        assert result["calculated_amount"] == 0.0

    def test_subsequent_transaction_fully_taxable(self, db):
        from app.services.tds_tcs import calculate_tds_tcs
        from tests.conftest import create_db_company
        co = create_db_company(db, "TDS Agg 3")
        section = self._make_194q(db, co.id)

        # 80L after, 70L before → next 10L is fully above the threshold
        result = calculate_tds_tcs(
            db, company_id=co.id, section_id=section.id, base_amount=1000000.0,
            aggregate_base_amount=8000000.0, previous_aggregate_base_amount=7000000.0,
        )
        assert result["is_applicable"] is True
        assert result["taxable_base"] == 1000000.0
        assert result["calculated_amount"] == 1000.0

    def test_entry_creation_aggregates_per_party_per_fy(self, db):
        from app.models.accounting import Party
        from app.models.voucher import Voucher
        from app.services.tds_tcs import create_tds_tcs_entry
        from tests.conftest import create_db_company

        co = create_db_company(db, "TDS Agg 4")
        section = self._make_194q(db, co.id)
        party = Party(company_id=co.id, name="Agg Supplier", party_type="supplier")
        db.add(party)
        db.commit()
        db.refresh(party)

        def _make_voucher() -> Voucher:
            v = Voucher(company_id=co.id, voucher_type="payment",
                        voucher_number=str(_make_voucher.seq), voucher_date="2025-05-01")
            _make_voucher.seq += 1
            db.add(v)
            db.commit()
            db.refresh(v)
            return v
        _make_voucher.seq = 1

        # Entry 1: 40L → aggregate 40L, still below the limit → no TDS
        v1 = _make_voucher()
        e1 = create_tds_tcs_entry(db, company_id=co.id, voucher_id=v1.id,
                                  party_id=party.id, section_id=section.id,
                                  base_amount=4000000.0, entry_date="2025-05-01")
        assert e1.deducted_amount == 0.0

        # Entry 2: 20L → aggregate 60L → 10L incremental excess @ 0.1% = ₹1,000
        v2 = _make_voucher()
        e2 = create_tds_tcs_entry(db, company_id=co.id, voucher_id=v2.id,
                                  party_id=party.id, section_id=section.id,
                                  base_amount=2000000.0, entry_date="2025-05-15")
        assert e2.deducted_amount == 1000.0

        # Entry 3: 10L → aggregate 70L → incremental excess another 10L
        v3 = _make_voucher()
        e3 = create_tds_tcs_entry(db, company_id=co.id, voucher_id=v3.id,
                                  party_id=party.id, section_id=section.id,
                                  base_amount=1000000.0, entry_date="2025-06-01")
        assert e3.deducted_amount == 1000.0

        # A different party's entries never leak into this aggregate
        other = Party(company_id=co.id, name="Other Supplier", party_type="supplier")
        db.add(other)
        db.commit()
        db.refresh(other)
        v4 = _make_voucher()
        e4 = create_tds_tcs_entry(db, company_id=co.id, voucher_id=v4.id,
                                  party_id=other.id, section_id=section.id,
                                  base_amount=6000000.0, entry_date="2025-06-01")
        # First entry for this party: aggregate 60L > 50L → 10L excess @ 0.1%
        assert e4.deducted_amount == 1000.0

    def test_buyer_turnover_gate_enforced_on_entry_creation(self, db):
        """Inward side: 194Q needs the deductor's own ₹10 Cr turnover gate.
        A buyer below ₹10 Cr must NOT deduct 194Q even past the ₹50L —
        mirroring TallyPrime's section master check. (The gate is an annual
        determination, so each scenario uses its own company.)"""
        from app.models.accounting import Party
        from app.models.voucher import Voucher
        from app.services.tds_tcs import create_tds_tcs_entry
        from tests.conftest import create_db_company

        def _run(buyer_turnover: float) -> float:
            co = create_db_company(db, f"TDS Agg {buyer_turnover}")
            section = self._make_194q(db, co.id)
            party = Party(company_id=co.id, name="Inward Supplier", party_type="supplier")
            db.add(party)
            db.commit()
            db.refresh(party)
            v = Voucher(company_id=co.id, voucher_type="payment", voucher_number="P1",
                        voucher_date="2025-05-01")
            db.add(v)
            db.commit()
            db.refresh(v)
            e = create_tds_tcs_entry(
                db, company_id=co.id, voucher_id=v.id, party_id=party.id,
                section_id=section.id, base_amount=6000000.0, entry_date="2025-05-01",
                buyer_turnover=buyer_turnover,
            )
            return e.deducted_amount

        # Small buyer (₹2 Cr < ₹10 Cr gate) → no 194Q at all
        assert _run(20000000.0) == 0.0
        # Big buyer (₹12 Cr ≥ ₹10 Cr) → 10L excess @ 0.1% = ₹1,000
        assert _run(120000000.0) == 1000.0

    def test_aggregate_resets_at_fy_boundary(self, db):
        """The ₹50L is per-FY: prior-FY purchases must not consume the
        current FY's limit (TallyPrime resets at 01-04)."""
        from app.models.accounting import Party
        from app.models.voucher import Voucher
        from app.services.tds_tcs import create_tds_tcs_entry
        from tests.conftest import create_db_company

        co = create_db_company(db, "TDS Agg 6")
        section = self._make_194q(db, co.id)
        party = Party(company_id=co.id, name="FY Supplier", party_type="supplier")
        db.add(party)
        db.commit()
        db.refresh(party)

        def _entry(number: str, date: str, amount: float) -> float:
            v = Voucher(company_id=co.id, voucher_type="payment",
                        voucher_number=number, voucher_date=date)
            db.add(v)
            db.commit()
            db.refresh(v)
            e = create_tds_tcs_entry(db, company_id=co.id, voucher_id=v.id,
                                     party_id=party.id, section_id=section.id,
                                     base_amount=amount, entry_date=date)
            return e.deducted_amount

        # FY 2024-25: 60L → 10L excess taxed
        assert _entry("FY1", "2025-02-01", 6000000.0) == 1000.0
        # FY 2025-26: fresh 60L → 10L excess taxed again (limit reset)
        assert _entry("FY2", "2025-05-01", 6000000.0) == 1000.0

    def test_194q_not_applicable_before_july_2021(self, db):
        """194Q commenced 01-07-2021 — purchases before that are exempt."""
        from app.models.accounting import Party
        from app.models.voucher import Voucher
        from app.services.tds_tcs import create_tds_tcs_entry
        from tests.conftest import create_db_company

        co = create_db_company(db, "TDS Agg 7")
        section = self._make_194q(db, co.id)
        party = Party(company_id=co.id, name="Old Supplier", party_type="supplier")
        db.add(party)
        db.commit()
        db.refresh(party)

        v = Voucher(company_id=co.id, voucher_type="payment", voucher_number="OLD1",
                    voucher_date="2021-03-15")
        db.add(v)
        db.commit()
        db.refresh(v)
        e = create_tds_tcs_entry(db, company_id=co.id, voucher_id=v.id,
                                 party_id=party.id, section_id=section.id,
                                 base_amount=6000000.0, entry_date="2021-03-15")
        assert e.deducted_amount == 0.0


class TestAggregateApi:
    def test_calculate_endpoint_accepts_aggregate_params(self, client):
        """The /calculate endpoint exposes the aggregate threshold params."""
        company, token = _setup_company(client, "tds-agg-api@example.com")
        cid = company["id"]
        section = client.post("/api/tds-tcs/sections", json={
            "section_code": "194Q", "section_name": "TDS on Purchase of Goods",
            "tds_tcs_type": "tds", "rate": 0.1, "threshold_limit": 5000000,
        }, headers=auth_header(token, cid)).json()

        resp = client.get(
            f"/api/tds-tcs/calculate?section_id={section['id']}&base_amount=2000000"
            "&aggregate_base_amount=6000000&previous_aggregate_base_amount=4000000",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_applicable"] is True
        assert data["taxable_base"] == 1000000.0
        assert data["calculated_amount"] == 1000.0

    def test_calculate_endpoint_below_aggregate(self, client):
        company, token = _setup_company(client, "tds-agg-api2@example.com")
        cid = company["id"]
        section = client.post("/api/tds-tcs/sections", json={
            "section_code": "194Q", "section_name": "TDS on Purchase of Goods",
            "tds_tcs_type": "tds", "rate": 0.1, "threshold_limit": 5000000,
        }, headers=auth_header(token, cid)).json()

        resp = client.get(
            f"/api/tds-tcs/calculate?section_id={section['id']}&base_amount=3000000"
            "&aggregate_base_amount=3000000&previous_aggregate_base_amount=0",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        assert resp.json()["is_applicable"] is False
        assert resp.json()["calculated_amount"] == 0.0


class TestInactiveSection:
    def test_withdrawn_section_returns_zero(self, db):
        """206C(1H) was withdrawn w.e.f. 01-04-2025 — inactive sections must
        never generate TCS, mirroring TallyPrime's section master."""
        from app.models.tds_tcs import TdsTcsSection
        from app.services.tds_tcs import calculate_tds_tcs
        from tests.conftest import create_db_company

        co = create_db_company(db, "TDS Inactive 1")
        section = TdsTcsSection(
            company_id=co.id, section_code="206C-1H",
            section_name="TCS on Sale of Goods (withdrawn w.e.f. 01-04-2025)",
            tds_tcs_type="tcs", rate=0.1, threshold_limit=5000000,
            is_active=False,
        )
        db.add(section)
        db.commit()
        db.refresh(section)

        result = calculate_tds_tcs(
            db, company_id=co.id, section_id=section.id, base_amount=6000000.0
        )
        assert result["is_applicable"] is False
        assert result["calculated_amount"] == 0.0

    def test_seeded_206c1h_is_inactive(self, client):
        """The default seed no longer activates withdrawn section 206C-1H."""
        company, token = _setup_company(client, "tds-inactive@example.com")
        cid = company["id"]
        client.post("/api/tds-tcs/sections/seed", headers=auth_header(token, cid))
        resp = client.get("/api/tds-tcs/sections", headers=auth_header(token, cid))
        section = next(s for s in resp.json() if s["section_code"] == "206C-1H")
        assert section["is_active"] is False


class TestTdsTcsSections:
    def test_seed_sections(self, client):
        company, token = _setup_company(client, "tds1@example.com")
        cid = company["id"]

        resp = client.post("/api/tds-tcs/sections/seed", headers=auth_header(token, cid))
        assert resp.status_code == 201

        resp = client.get("/api/tds-tcs/sections", headers=auth_header(token, cid))
        assert resp.status_code == 200
        sections = resp.json()
        assert len(sections) >= 10  # Common sections seeded
        codes = {s["section_code"] for s in sections}
        assert "194C-I" in codes
        assert "194J" in codes

    def test_create_section(self, client):
        company, token = _setup_company(client, "tds2@example.com")
        cid = company["id"]

        resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194Q",
            "section_name": "TDS on Purchase of Goods",
            "tds_tcs_type": "tds",
            "rate": 0.1,
            "threshold_limit": 5000000,
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["section_code"] == "194Q"
        assert data["rate"] == 0.1

    def test_delete_section(self, client):
        company, token = _setup_company(client, "tds3@example.com")
        cid = company["id"]

        create_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194X",
            "section_name": "Test Section",
            "tds_tcs_type": "tds",
            "rate": 5.0,
            "threshold_limit": 0,
        }, headers=auth_header(token, cid))
        section_id = create_resp.json()["id"]

        resp = client.delete(f"/api/tds-tcs/sections/{section_id}", headers=auth_header(token, cid))
        assert resp.status_code == 204

    def test_list_filter_by_type(self, client):
        company, token = _setup_company(client, "tds4@example.com")
        cid = company["id"]

        client.post("/api/tds-tcs/sections/seed", headers=auth_header(token, cid))

        resp = client.get("/api/tds-tcs/sections?tds_tcs_type=tcs", headers=auth_header(token, cid))
        assert resp.status_code == 200
        for s in resp.json():
            assert s["tds_tcs_type"] == "tcs"


class TestTdsTcsEntries:
    def test_create_entry(self, client):
        company, token = _setup_company(client, "tds5@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)
        tds_liability = _create_tds_liability_ledger(client, token, cid)
        party = _create_party(client, token, cid)

        # Create section
        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J",
            "section_name": "Professional Fees",
            "tds_tcs_type": "tds",
            "rate": 10.0,
            "threshold_limit": 30000,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        # Create voucher
        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment",
            "voucher_number": "BP100",
            "voucher_date": "2025-04-15",
            "narration": "Professional fees",
            "lines": [
                {"ledger_id": expense["id"], "debit": 50000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 50000},
            ],
        }, headers=auth_header(token, cid))
        voucher_id = vch_resp.json()["id"]

        # Create TDS entry
        resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": voucher_id,
            "party_id": party["id"],
            "section_id": section_id,
            "base_amount": 50000,
            "entry_date": "2025-04-15",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["deducted_amount"] == 5000.0  # 10% of 50000
        assert data["rate"] == 10.0
        assert data["status"] == "pending"

    def test_entry_below_threshold(self, client):
        company, token = _setup_company(client, "tds6@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)
        party = _create_party(client, token, cid)

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194C",
            "section_name": "Contractors",
            "tds_tcs_type": "tds",
            "rate": 1.0,
            "threshold_limit": 30000,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP101", "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": expense["id"], "debit": 20000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 20000},
            ],
        }, headers=auth_header(token, cid))
        voucher_id = vch_resp.json()["id"]

        resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": voucher_id,
            "section_id": section_id,
            "base_amount": 20000,
            "entry_date": "2025-04-15",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        assert resp.json()["deducted_amount"] == 0  # Below threshold

    def test_list_entries(self, client):
        company, token = _setup_company(client, "tds7@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 0,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP102", "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": expense["id"], "debit": 10000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
            ],
        }, headers=auth_header(token, cid))

        client.post("/api/tds-tcs/entries", json={
            "voucher_id": vch_resp.json()["id"], "section_id": section_id,
            "base_amount": 10000, "entry_date": "2025-04-15",
        }, headers=auth_header(token, cid))

        resp = client.get("/api/tds-tcs/entries", headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestDeposit:
    def test_deposit_entries(self, client):
        company, token = _setup_company(client, "tds8@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 0,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP103", "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": expense["id"], "debit": 10000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
            ],
        }, headers=auth_header(token, cid))

        entry_resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": vch_resp.json()["id"], "section_id": section_id,
            "base_amount": 10000, "entry_date": "2025-04-15",
        }, headers=auth_header(token, cid))
        entry_id = entry_resp.json()["id"]

        resp = client.post("/api/tds-tcs/deposit", json={
            "entry_ids": [entry_id],
            "challan_number": "CHALLAN001",
            "deposition_date": "2025-04-20",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data[0]["status"] == "deposited"
        assert data[0]["challan_number"] == "CHALLAN001"


class TestReturns:
    def test_generate_return(self, client):
        company, token = _setup_company(client, "tds9@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 0,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP104", "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": expense["id"], "debit": 10000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
            ],
        }, headers=auth_header(token, cid))

        entry_resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": vch_resp.json()["id"], "section_id": section_id,
            "base_amount": 10000, "entry_date": "2025-05-15",
        }, headers=auth_header(token, cid))
        entry_id = entry_resp.json()["id"]

        # Deposit first
        client.post("/api/tds-tcs/deposit", json={
            "entry_ids": [entry_id],
            "challan_number": "CH001",
            "deposition_date": "2025-06-10",
        }, headers=auth_header(token, cid))

        # Generate return
        resp = client.post("/api/tds-tcs/returns", json={
            "return_type": "tds",
            "quarter": "Q1",
            "financial_year": "2025-26",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 201
        data = resp.json()
        assert data["total_entries"] == 1
        assert data["total_tax"] == 1000.0
        assert data["status"] == "draft"

    def test_file_return(self, client):
        company, token = _setup_company(client, "tds10@example.com")
        cid = company["id"]
        bank = _create_bank_ledger(client, token, cid)
        expense = _create_expense_ledger(client, token, cid)

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 0,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        vch_resp = client.post("/api/vouchers", json={
            "voucher_type": "payment", "voucher_number": "BP105", "voucher_date": "2025-04-15",
            "lines": [
                {"ledger_id": expense["id"], "debit": 10000, "credit": 0},
                {"ledger_id": bank["id"], "debit": 0, "credit": 10000},
            ],
        }, headers=auth_header(token, cid))

        entry_resp = client.post("/api/tds-tcs/entries", json={
            "voucher_id": vch_resp.json()["id"], "section_id": section_id,
            "base_amount": 10000, "entry_date": "2025-05-01",
        }, headers=auth_header(token, cid))

        client.post("/api/tds-tcs/deposit", json={
            "entry_ids": [entry_resp.json()["id"]],
            "challan_number": "CH002",
            "deposition_date": "2025-06-10",
        }, headers=auth_header(token, cid))

        ret_resp = client.post("/api/tds-tcs/returns", json={
            "return_type": "tds", "quarter": "Q1", "financial_year": "2025-26",
        }, headers=auth_header(token, cid))
        return_id = ret_resp.json()["id"]

        resp = client.patch(f"/api/tds-tcs/returns/{return_id}/file", json={
            "ack_number": "ACK123456",
            "filing_date": "2025-07-15",
        }, headers=auth_header(token, cid))
        assert resp.status_code == 200
        assert resp.json()["status"] == "filed"
        assert resp.json()["ack_number"] == "ACK123456"


class TestSummary:
    def test_summary(self, client):
        company, token = _setup_company(client, "tds11@example.com")
        cid = company["id"]

        resp = client.get("/api/tds-tcs/summary", headers=auth_header(token, cid))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_entries"] == 0
        assert data["pending_amount"] == 0


class TestCalculate:
    def test_calculate(self, client):
        company, token = _setup_company(client, "tds12@example.com")
        cid = company["id"]

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 30000,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        resp = client.get(
            f"/api/tds-tcs/calculate?section_id={section_id}&base_amount=50000",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["calculated_amount"] == 5000.0
        assert data["is_applicable"] is True

    def test_calculate_below_threshold(self, client):
        company, token = _setup_company(client, "tds13@example.com")
        cid = company["id"]

        section_resp = client.post("/api/tds-tcs/sections", json={
            "section_code": "194J", "section_name": "Professional", "tds_tcs_type": "tds", "rate": 10.0, "threshold_limit": 30000,
        }, headers=auth_header(token, cid))
        section_id = section_resp.json()["id"]

        resp = client.get(
            f"/api/tds-tcs/calculate?section_id={section_id}&base_amount=20000",
            headers=auth_header(token, cid),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["calculated_amount"] == 0
        assert data["is_applicable"] is False


class TestUnauthorized:
    def test_unauthenticated(self, client):
        resp = client.get("/api/tds-tcs/sections")
        assert resp.status_code in (401, 403)
