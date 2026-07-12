"""v1 API routers."""
from fastapi import APIRouter

from app.api.v1 import auth, companies, accounting, gst, vouchers, reports, dashboard, einvoice, eway_bill, members, admin, audit, bank_reconciliation, tds_tcs, inventory, daybook, masters, tally_import, recurring_templates, payments, attachments, setup, activity, manufacturing, batches, notifications, data_import, search, assets

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(setup.router, prefix="/setup", tags=["setup"])
api_router.include_router(companies.router, prefix="/companies", tags=["companies"])
api_router.include_router(accounting.router, prefix="/coa", tags=["chart-of-accounts"])
api_router.include_router(gst.router, prefix="/gst", tags=["gst"])
api_router.include_router(vouchers.router, prefix="/vouchers", tags=["vouchers"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(einvoice.router, prefix="/einvoice", tags=["e-invoice"])
api_router.include_router(eway_bill.router, prefix="/eway-bill", tags=["eway-bill"])
api_router.include_router(members.router, prefix="/members", tags=["members"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit-log"])
api_router.include_router(bank_reconciliation.router, prefix="/bank-reconciliation", tags=["bank-reconciliation"])
api_router.include_router(tds_tcs.router, prefix="/tds-tcs", tags=["tds-tcs"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
api_router.include_router(daybook.router, prefix="/reports", tags=["daybook"])
api_router.include_router(masters.router, prefix="/masters", tags=["masters"])
api_router.include_router(tally_import.router, prefix="/tally-import", tags=["tally-import"])
api_router.include_router(recurring_templates.router, prefix="/recurring-templates", tags=["recurring-templates"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(attachments.router, prefix="/attachments", tags=["attachments"])
api_router.include_router(activity.router, prefix="/activity", tags=["activity"])
api_router.include_router(manufacturing.router, prefix="/manufacturing", tags=["manufacturing"])
api_router.include_router(batches.router, prefix="/manufacturing", tags=["batches"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(data_import.router, prefix="/data-import", tags=["data-import"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(assets.router, prefix="/fixed-assets", tags=["fixed-assets"])

__all__ = ["api_router"]
