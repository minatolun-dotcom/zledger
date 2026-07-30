# Bill-wise Accounting Implementation Plan

**Date:** 2026-07-30  
**Module:** Voucher Intelligence Module 1 - Bill-wise Accounting & Outstanding Management

---

## Existing Functionality Assessment

### ✅ Already Implemented (Strong Foundation)

#### 1. Payment Allocation System
**Model:** `PaymentAllocation` (`backend/app/models/payment_allocation.py`)
- Links payment/receipt vouchers to invoices
- Tracks allocated amount
- Stores allocation date and remarks
- Proper foreign keys and cascade

**Services:** `backend/app/services/payments.py`
- `get_receivables()` - Outstanding sales with aging buckets
- `get_payables()` - Outstanding purchase bills with aging
- `allocate_payment()` - Allocate payment to invoice with validation
- `get_invoice_allocations()` - List all allocations for an invoice
- `delete_allocation()` - Remove allocation
- Aging buckets: Current, 1-30, 31-60, 61-90, 90+ days

**API Endpoints:** `backend/app/api/v1/payments.py`
- `GET /payments/receivables` - List outstanding receivables
- `GET /payments/payables` - List outstanding payables
- `GET /payments/allocations/{invoice_id}` - Get allocations
- `POST /payments/allocate` - Create allocation
- `DELETE /payments/allocations/{id}` - Delete allocation

#### 2. Outstanding Reports
**Services:** `backend/app/services/reports.py`
- `get_outstanding()` - Debtors and creditors with balances
- `get_aging()` - Aging analysis report
- Export functions for PDF/XLSX

**API Endpoints:** `backend/app/api/v1/reports.py`
- `GET /reports/outstanding` - Outstanding report
- `GET /reports/outstanding/pdf` - Export to PDF
- `GET /reports/outstanding/xlsx` - Export to Excel

#### 3. Voucher Model Support
**Model:** `Voucher` (`backend/app/models/voucher.py`)
- `due_date` field (YYYY-MM-DD format)
- `party_id` for customer/supplier linking
- `status` field (draft/posted/cancelled)
- `reference` field for bill numbers

---

## Missing Functionality (To Be Implemented)

### 1. Bill Reference Structure ❌
**Issue:** No dedicated bill reference model linking invoices to payments

**Need:**
- Bill reference types (New Ref, Against Ref, Advance, On Account)
- Bill-wise allocation structure
- Multiple bill settlement support
- Partial payment tracking

### 2. Bill Types & Reference Types ❌
**Issue:** No support for Tally-style bill types

**Need:**
- New Reference (fresh invoice)
- Against Reference (settle existing bill)
- Advance (customer/supplier advance)
- On Account (partial, no specific bill)
- Others

### 3. Auto-Bill Creation ❌
**Issue:** Sales/Purchase vouchers don't auto-create bill references

**Need:**
- Auto-create bill on Sales invoice save
- Auto-create bill on Purchase invoice save
- Bill status tracking (Open/Partially Paid/Paid/Cancelled)

### 4. Advance Management ❌
**Issue:** No dedicated advance tracking

**Need:**
- Customer advance tracking
- Supplier advance tracking
- Advance adjustment against future bills
- Advance aging report

### 5. Credit/Debit Note Adjustment ❌
**Issue:** Credit/Debit notes don't adjust outstanding

**Need:**
- Auto-adjust outstanding on Credit Note
- Auto-adjust outstanding on Debit Note
- Show adjusted amount in reports

### 6. Receipt/Payment Voucher Integration ❌
**Issue:** No UI to select and settle outstanding bills

**Need:**
- Outstanding bills selector in Receipt voucher
- Outstanding bills selector in Payment voucher
- Full/partial settlement UI
- Multiple bill settlement
- Remaining balance display

### 7. Customer/Supplier Statements ❌
**Issue:** Detailed party-wise statements not available

**Need:**
- Customer statement with all transactions
- Supplier statement with all transactions
- Opening balance
- Closing balance
- Outstanding drill-down

### 8. Validation Rules ❌
**Issue:** No validation for over-allocation

**Need:**
- Prevent allocation > invoice amount
- Prevent negative outstanding
- Prevent duplicate settlement
- Settlement amount validation

---

## Implementation Architecture

### Database Schema

#### New Table: `bill_references`
```sql
CREATE TABLE bill_references (
    id VARCHAR(36) PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    invoice_voucher_id VARCHAR(36) NOT NULL,  -- The original invoice
    reference_type VARCHAR(20) NOT NULL,      -- 'new_ref', 'against_ref', 'advance', 'on_account'
    bill_number VARCHAR(50),                  -- Bill number (can be same as voucher_number)
    bill_date VARCHAR(10) NOT NULL,           -- YYYY-MM-DD
    due_date VARCHAR(10),                     -- Due date
    original_amount NUMERIC(18,2) NOT NULL,   -- Original invoice amount
    adjusted_amount NUMERIC(18,2) DEFAULT 0,  -- Amount adjusted via Cr/Dr notes
    paid_amount NUMERIC(18,2) DEFAULT 0,      -- Amount paid/received
    outstanding_amount NUMERIC(18,2) NOT NULL,-- Remaining amount
    status VARCHAR(20) DEFAULT 'open',        -- 'open', 'partial', 'paid', 'cancelled'
    party_id VARCHAR(36),                     -- Customer/Supplier
    is_advance BOOLEAN DEFAULT FALSE,         -- Is this an advance?
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (invoice_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL
);

CREATE INDEX idx_bill_refs_company ON bill_references(company_id);
CREATE INDEX idx_bill_refs_invoice ON bill_references(invoice_voucher_id);
CREATE INDEX idx_bill_refs_party ON bill_references(party_id);
CREATE INDEX idx_bill_refs_status ON bill_references(status);
```

#### Update Table: `payment_allocations`
```sql
ALTER TABLE payment_allocations ADD COLUMN bill_reference_id VARCHAR(36);
ALTER TABLE payment_allocations ADD COLUMN allocation_type VARCHAR(20) DEFAULT 'against_ref';
-- 'against_ref', 'advance', 'on_account'

CREATE INDEX idx_payment_alloc_bill_ref ON payment_allocations(bill_reference_id);
```

### Service Layer

#### `backend/app/services/bill_wise.py` (New)
```python
def create_bill_reference(db, company_id, voucher, reference_type='new_ref')
def get_outstanding_bills(db, company_id, party_id, voucher_type)
def allocate_to_bill(db, company_id, bill_ref_id, payment_voucher_id, amount)
def adjust_bill_amount(db, company_id, bill_ref_id, adjustment_amount, reason)
def get_bill_status(db, bill_ref_id)
def get_party_statement(db, company_id, party_id, start_date, end_date)
def validate_settlement(db, bill_ref_id, amount)
```

### API Layer

#### `backend/app/api/v1/bills.py` (New)
```python
GET /bills/outstanding/{party_id}          # Get outstanding bills for party
POST /bills/settle                          # Settle one or more bills
GET /bills/statement/{party_id}            # Party statement
POST /bills/advance                        # Record advance
PUT /bills/{bill_id}/adjust               # Adjust bill (Cr/Dr note)
```

### Frontend Components

#### Receipt/Payment Voucher Enhancement
- Add `<OutstandingBillsSelector>` component
- Show list of outstanding bills when party selected
- Allow full/partial/multiple settlement
- Display remaining balance

#### New Pages
- Customer Statement (`/parties/customer-statement`)
- Supplier Statement (`/parties/supplier-statement`)
- Outstanding Bills Browser (`/outstanding-bills`)

---

## Implementation Phases

### Phase 1: Backend Foundation (Models & Migrations)
**Duration:** 2-3 hours

1. Create `BillReference` model
2. Add bill-wise fields to existing models
3. Create Alembic migration
4. Update schemas

### Phase 2: Backend Services & Logic
**Duration:** 4-6 hours

1. Auto-create bills on Sales/Purchase save
2. Bill settlement service
3. Advance tracking service
4. Credit/Debit note adjustment
5. Validation rules
6. Party statement generation

### Phase 3: Backend API Endpoints
**Duration:** 2-3 hours

1. Bill reference CRUD endpoints
2. Outstanding bills endpoint
3. Settlement endpoint
4. Statement generation endpoint
5. Update existing payment APIs

### Phase 4: Frontend Components
**Duration:** 4-6 hours

1. `OutstandingBillsSelector` component
2. Update Receipt voucher form
3. Update Payment voucher form
4. Advance adjustment UI
5. Bill status indicators

### Phase 5: Frontend Reports & Statements
**Duration:** 3-4 hours

1. Customer statement page
2. Supplier statement page
3. Outstanding bills browser
4. Enhanced aging report

### Phase 6: Testing & Validation
**Duration:** 2-3 hours

1. Unit tests for services
2. API endpoint tests
3. E2E bill-wise cycle test
4. Validation rule tests

**Total Estimated Time:** 17-25 hours

---

## Success Criteria

### Functional Requirements
- [x] Sales invoice auto-creates bill reference
- [ ] Purchase invoice auto-creates bill reference
- [ ] Receipt voucher shows outstanding bills
- [ ] Payment voucher shows outstanding bills
- [ ] Full settlement reduces outstanding to zero
- [ ] Partial settlement updates outstanding
- [ ] Multiple bill settlement in one payment
- [ ] Advance receipts tracked separately
- [ ] Advance adjustments work correctly
- [ ] Credit note reduces outstanding
- [ ] Debit note reduces supplier outstanding
- [ ] Over-allocation prevented
- [ ] Customer statement generates correctly
- [ ] Supplier statement generates correctly
- [ ] Aging analysis accurate

### Performance Requirements
- Outstanding bills query < 500ms
- Settlement operation < 1s
- Statement generation < 2s

### Data Integrity Requirements
- No over-allocation possible
- No negative outstanding
- All settlements linked to bills
- Audit trail maintained

---

## Next Steps

1. **Immediate:** Create `BillReference` model and migration
2. **Next:** Implement auto-bill creation on Sales/Purchase
3. **Then:** Build settlement service and validation
4. **Finally:** Frontend integration and testing

---

**Status:** Ready to implement  
**Priority:** HIGH (Foundation for receipt/payment intelligence)  
**Dependencies:** None (existing payment_allocations table sufficient for phase 1)
