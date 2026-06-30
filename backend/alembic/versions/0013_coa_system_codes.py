"""COA system codes and restructured groups

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_coa_system_codes"
down_revision = "0012_voucher_enhancements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add system_code to account_groups (nullable first, backfill, then unique)
    op.add_column("account_groups", sa.Column("system_code", sa.String(50), nullable=True))

    # Add system_code and is_protected to ledgers
    op.add_column("ledgers", sa.Column("system_code", sa.String(50), nullable=True))
    op.add_column("ledgers", sa.Column("is_protected", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    # Backfill system_codes for existing groups
    op.execute("""
        UPDATE account_groups SET system_code = CASE name
            WHEN 'Current Assets' THEN 'GRP_CURRENT_ASSETS'
            WHEN 'Bank Accounts' THEN 'GRP_BANK_ACCOUNTS'
            WHEN 'Cash-in-Hand' THEN 'GRP_CASH_IN_HAND'
            WHEN 'Deposits (Assets)' THEN 'GRP_DEPOSITS_ASSETS'
            WHEN 'Loans & Advances (Assets)' THEN 'GRP_LOANS_ADVANCES_ASSETS'
            WHEN 'Stock-in-Hand' THEN 'GRP_STOCK_IN_HAND'
            WHEN 'Sundry Debtors' THEN 'GRP_SUNDRY_DEBTORS'
            WHEN 'Fixed Assets' THEN 'GRP_FIXED_ASSETS'
            WHEN 'Investments' THEN 'GRP_INVESTMENTS'
            WHEN 'Current Liabilities' THEN 'GRP_CURRENT_LIABILITIES'
            WHEN 'Duties & Taxes' THEN 'GRP_DUTIES_TAXES'
            WHEN 'Provisions' THEN 'GRP_PROVISIONS'
            WHEN 'Sundry Creditors' THEN 'GRP_SUNDRY_CREDITORS'
            WHEN 'Loans & Advances (Liabilities)' THEN 'GRP_LOANS_ADVANCES_LIABILITIES'
            WHEN 'Capital Account' THEN 'GRP_EQUITY'
            WHEN 'Reserves & Surplus' THEN 'GRP_RESERVES_SURPLUS'
            WHEN 'Profit & Loss A/c' THEN 'GRP_PROFIT_LOSS'
            WHEN 'Sales Accounts' THEN 'GRP_SALES_ACCOUNTS'
            WHEN 'Purchase Accounts' THEN 'GRP_PURCHASE_ACCOUNTS'
            WHEN 'Direct Incomes' THEN 'GRP_DIRECT_INCOMES'
            WHEN 'Indirect Incomes' THEN 'GRP_INDIRECT_INCOMES'
            WHEN 'Direct Expenses' THEN 'GRP_DIRECT_EXPENSES'
            WHEN 'Indirect Expenses' THEN 'GRP_INDIRECT_EXPENSES'
            ELSE 'GRP_' || UPPER(REPLACE(REPLACE(name, ' ', '_'), '&', 'AND'))
        END
        WHERE system_code IS NULL
    """)

    # Backfill system_codes for existing ledgers
    op.execute("""
        UPDATE ledgers SET system_code = CASE name
            WHEN 'Cash' THEN 'SYS_CASH'
            WHEN 'Bank Account' THEN 'SYS_BANK_ACCOUNT'
            WHEN 'Capital Account' THEN 'SYS_CAPITAL_ACCOUNT'
            WHEN 'Sales' THEN 'SYS_SALES'
            WHEN 'Purchases' THEN 'SYS_PURCHASES'
            WHEN 'CGST Output' THEN 'SYS_GST_OUTPUT_CGST'
            WHEN 'SGST Output' THEN 'SYS_GST_OUTPUT_SGST'
            WHEN 'IGST Output' THEN 'SYS_GST_OUTPUT_IGST'
            WHEN 'CGST Input' THEN 'SYS_GST_INPUT_CGST'
            WHEN 'SGST Input' THEN 'SYS_GST_INPUT_SGST'
            WHEN 'IGST Input' THEN 'SYS_GST_INPUT_IGST'
            WHEN 'RCM CGST Input' THEN 'SYS_RCM_CGST'
            WHEN 'RCM SGST Input' THEN 'SYS_RCM_SGST'
            WHEN 'RCM IGST Input' THEN 'SYS_RCM_IGST'
            ELSE 'SYS_' || UPPER(REPLACE(REPLACE(name, ' ', '_'), '&', 'AND'))
        END,
        is_protected = CASE
            WHEN name IN ('Cash', 'Bank Account', 'Capital Account', 'Sales', 'Purchases',
                          'CGST Output', 'SGST Output', 'IGST Output',
                          'CGST Input', 'SGST Input', 'IGST Input',
                          'RCM CGST Input', 'RCM SGST Input', 'RCM IGST Input')
            THEN true
            ELSE false
        END
        WHERE system_code IS NULL
    """)

    # Create unique indexes (after backfill) — per-company uniqueness
    op.create_index("uq_ag_company_system_code", "account_groups", ["company_id", "system_code"], unique=True)
    op.create_index("uq_ledger_company_system_code", "ledgers", ["company_id", "system_code"], unique=True)

    # Create new GST subgroups under Duties & Taxes
    # First get Duties & Taxes group_id per company, create subgroups, then move existing GST ledgers

    # Create GST Input subgroup
    op.execute("""
        WITH duties AS (
            SELECT id, company_id FROM account_groups WHERE name = 'Duties & Taxes' AND system_code = 'GRP_DUTIES_TAXES'
        ),
        new_groups AS (
            INSERT INTO account_groups (id, company_id, name, system_code, parent_id, group_type, nature, is_system, created_at, updated_at)
            SELECT
                gen_random_uuid()::text,
                d.company_id,
                sg.name,
                sg.code,
                d.id,
                'sub',
                'liabilities',
                true,
                NOW(),
                NOW()
            FROM duties d
            CROSS JOIN (VALUES
                ('GST Input', 'GRP_GST_INPUT'),
                ('GST Output', 'GRP_GST_OUTPUT'),
                ('Reverse Charge', 'GRP_REVERSE_CHARGE')
            ) AS sg(name, code)
            WHERE NOT EXISTS (
                SELECT 1 FROM account_groups ag
                WHERE ag.company_id = d.company_id AND ag.system_code = sg.code
            )
        )
        SELECT 1
    """)

    # Move existing GST ledgers to appropriate subgroups
    op.execute("""
        UPDATE ledgers l
        SET group_id = ag.id
        FROM account_groups ag
        WHERE ag.company_id = l.company_id
        AND ag.system_code = CASE l.system_code
            WHEN 'SYS_GST_INPUT_CGST' THEN 'GRP_GST_INPUT'
            WHEN 'SYS_GST_INPUT_SGST' THEN 'GRP_GST_INPUT'
            WHEN 'SYS_GST_INPUT_IGST' THEN 'GRP_GST_INPUT'
            WHEN 'SYS_GST_OUTPUT_CGST' THEN 'GRP_GST_OUTPUT'
            WHEN 'SYS_GST_OUTPUT_SGST' THEN 'GRP_GST_OUTPUT'
            WHEN 'SYS_GST_OUTPUT_IGST' THEN 'GRP_GST_OUTPUT'
            WHEN 'SYS_RCM_CGST' THEN 'GRP_REVERSE_CHARGE'
            WHEN 'SYS_RCM_SGST' THEN 'GRP_REVERSE_CHARGE'
            WHEN 'SYS_RCM_IGST' THEN 'GRP_REVERSE_CHARGE'
        END
        AND l.system_code IN (
            'SYS_GST_INPUT_CGST', 'SYS_GST_INPUT_SGST', 'SYS_GST_INPUT_IGST',
            'SYS_GST_OUTPUT_CGST', 'SYS_GST_OUTPUT_SGST', 'SYS_GST_OUTPUT_IGST',
            'SYS_RCM_CGST', 'SYS_RCM_SGST', 'SYS_RCM_IGST'
        )
    """)

    # Rename "Capital Account" group to "Equity" for modern Indian accounting
    op.execute("""
        UPDATE account_groups
        SET name = 'Equity'
        WHERE system_code = 'GRP_EQUITY'
    """)

    # Create additional subgroups under Equity
    op.execute("""
        WITH equity AS (
            SELECT id, company_id FROM account_groups WHERE system_code = 'GRP_EQUITY'
        ),
        new_groups AS (
            INSERT INTO account_groups (id, company_id, name, system_code, parent_id, group_type, nature, is_system, created_at, updated_at)
            SELECT
                gen_random_uuid()::text,
                e.company_id,
                sg.name,
                sg.code,
                e.id,
                'sub',
                'capital',
                true,
                NOW(),
                NOW()
            FROM equity e
            CROSS JOIN (VALUES
                ('Drawings', 'GRP_DRAWINGS'),
                ('Opening Balance Equity', 'GRP_OPENING_BALANCE_EQUITY')
            ) AS sg(name, code)
            WHERE NOT EXISTS (
                SELECT 1 FROM account_groups ag
                WHERE ag.company_id = e.company_id AND ag.system_code = sg.code
            )
        )
        SELECT 1
    """)

    # Create Suspense A/c under Current Assets
    op.execute("""
        WITH ca AS (
            SELECT id, company_id FROM account_groups WHERE system_code = 'GRP_CURRENT_ASSETS'
        )
        INSERT INTO account_groups (id, company_id, name, system_code, parent_id, group_type, nature, is_system, created_at, updated_at)
        SELECT
            gen_random_uuid()::text,
            ca.company_id,
            'Suspense A/c',
            'GRP_SUSPENSE',
            ca.id,
            'sub',
            'assets',
            true,
            NOW(),
            NOW()
        FROM ca
        WHERE NOT EXISTS (
            SELECT 1 FROM account_groups ag
            WHERE ag.company_id = ca.company_id AND ag.system_code = 'GRP_SUSPENSE'
        )
    """)

    # Create system ledgers for each company
    op.execute("""
        WITH company_ids AS (
            SELECT DISTINCT company_id FROM account_groups
        ),
        system_ledgers AS (
            SELECT ci.company_id, sl.name, sl.code, sl.group_code, sl.bal_type
            FROM company_ids ci
            CROSS JOIN (VALUES
                ('Round Off', 'SYS_ROUND_OFF', 'GRP_INDIRECT_INCOMES', 'Cr'),
                ('Discount Allowed', 'SYS_DISCOUNT_ALLOWED', 'GRP_INDIRECT_INCOMES', 'Cr'),
                ('Discount Received', 'SYS_DISCOUNT_RECEIVED', 'GRP_INDIRECT_EXPENSES', 'Dr'),
                ('Bank Charges', 'SYS_BANK_CHARGES', 'GRP_INDIRECT_EXPENSES', 'Dr'),
                ('Interest Paid', 'SYS_INTEREST_PAID', 'GRP_INDIRECT_EXPENSES', 'Dr'),
                ('Interest Received', 'SYS_INTEREST_RECEIVED', 'GRP_INDIRECT_INCOMES', 'Cr'),
                ('Freight Inward', 'SYS_FREIGHT_INWARD', 'GRP_DIRECT_EXPENSES', 'Dr'),
                ('Inventory Adjustment', 'SYS_INVENTORY_ADJUSTMENT', 'GRP_DIRECT_EXPENSES', 'Dr'),
                ('Miscellaneous Expenses', 'SYS_MISCELLANEOUS_EXPENSES', 'GRP_INDIRECT_EXPENSES', 'Dr')
            ) AS sl(name, code, group_code, bal_type)
        )
        INSERT INTO ledgers (id, company_id, name, system_code, group_id, opening_balance, opening_balance_type, is_active, is_protected, created_at, updated_at)
        SELECT
            gen_random_uuid()::text,
            sl.company_id,
            sl.name,
            sl.code,
            ag.id,
            0,
            sl.bal_type,
            true,
            true,
            NOW(),
            NOW()
        FROM system_ledgers sl
        JOIN account_groups ag ON ag.company_id = sl.company_id AND ag.system_code = sl.group_code
        WHERE NOT EXISTS (
            SELECT 1 FROM ledgers l
            WHERE l.company_id = sl.company_id AND l.system_code = sl.code
        )
    """)

    # Mark existing system ledgers as protected
    op.execute("""
        UPDATE ledgers
        SET is_protected = true
        WHERE system_code IN (
            'SYS_CASH', 'SYS_BANK_ACCOUNT', 'SYS_CAPITAL_ACCOUNT', 'SYS_SALES', 'SYS_PURCHASES',
            'SYS_GST_OUTPUT_CGST', 'SYS_GST_OUTPUT_SGST', 'SYS_GST_OUTPUT_IGST',
            'SYS_GST_INPUT_CGST', 'SYS_GST_INPUT_SGST', 'SYS_GST_INPUT_IGST',
            'SYS_RCM_CGST', 'SYS_RCM_SGST', 'SYS_RCM_IGST'
        )
    """)


def downgrade() -> None:
    op.drop_index("uq_ledger_company_system_code", table_name="ledgers")
    op.drop_index("uq_ag_company_system_code", table_name="account_groups")
    op.drop_column("ledgers", "is_protected")
    op.drop_column("ledgers", "system_code")
    op.drop_column("account_groups", "system_code")
