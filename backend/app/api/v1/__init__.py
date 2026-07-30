"""v1 API routers."""
from fastapi import APIRouter, Depends

from app.api.v1 import auth, companies, accounting, gst, vouchers, reports, dashboard, einvoice, eway_bill, members, admin, audit, bank_reconciliation, tds_tcs, inventory, daybook, masters, tally_import, recurring_templates, payments, attachments, setup, activity, manufacturing, batches, notifications, data_import, search, assets, loans, compliance, bills
from app.core.dependencies import require_module

api_router = APIRouter()

# ── Ungated (core / admin / cross-cutting) ──────────────────────────────────
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(setup.router, prefix="/setup", tags=["setup"])
api_router.include_router(companies.router, prefix="/companies", tags=["companies"])
api_router.include_router(accounting.router, prefix="/coa", tags=["chart-of-accounts"])
api_router.include_router(vouchers.router, prefix="/vouchers", tags=["vouchers"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(daybook.router, prefix="/reports", tags=["daybook"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(members.router, prefix="/members", tags=["members"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit-log"])
api_router.include_router(masters.router, prefix="/masters", tags=["masters"])
api_router.include_router(recurring_templates.router, prefix="/recurring-templates", tags=["recurring-templates"])
api_router.include_router(attachments.router, prefix="/attachments", tags=["attachments"])
api_router.include_router(activity.router, prefix="/activity", tags=["activity"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(data_import.router, prefix="/data-import", tags=["data-import"])
api_router.include_router(bills.router, prefix="/bills", tags=["bills"])
api_router.include_router(search.router, prefix="/search", tags=["search"])

# ── Module-gated ────────────────────────────────────────────────────────────
api_router.include_router(gst.router, prefix="/gst", tags=["gst"],
                          dependencies=[Depends(require_module("gst"))])
api_router.include_router(einvoice.router, prefix="/einvoice", tags=["e-invoice"],
                          dependencies=[Depends(require_module("gst"))])
api_router.include_router(eway_bill.router, prefix="/eway-bill", tags=["eway-bill"],
                          dependencies=[Depends(require_module("gst"))])
api_router.include_router(bank_reconciliation.router, prefix="/bank-reconciliation", tags=["bank-reconciliation"],
                          dependencies=[Depends(require_module("bank_reconciliation"))])
api_router.include_router(tds_tcs.router, prefix="/tds-tcs", tags=["tds-tcs"],
                          dependencies=[Depends(require_module("tds_tcs"))])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"],
                          dependencies=[Depends(require_module("inventory"))])
api_router.include_router(manufacturing.router, prefix="/manufacturing", tags=["manufacturing"],
                          dependencies=[Depends(require_module("manufacturing"))])
api_router.include_router(batches.router, prefix="/manufacturing", tags=["batches"],
                          dependencies=[Depends(require_module("batches"))])
api_router.include_router(tally_import.router, prefix="/tally-import", tags=["tally-import"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"],
                          dependencies=[Depends(require_module("payments"))])
api_router.include_router(assets.router, prefix="/fixed-assets", tags=["fixed-assets"],
                          dependencies=[Depends(require_module("fixed_assets"))])
api_router.include_router(loans.router, prefix="/loans", tags=["loans"],
                           dependencies=[Depends(require_module("loans"))])
api_router.include_router(compliance.router, prefix="/compliance", tags=["compliance"],
                          dependencies=[Depends(require_module("compliance"))])

__all__ = ["api_router"]
