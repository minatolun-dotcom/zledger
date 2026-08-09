"""Superadmin endpoints: user management and company management."""
from __future__ import annotations

import json
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.models.user import Company, CompanyMember, User
from app.schemas.user import AdminUserOut, AdminUserUpdate, CompanyMemberBrief, CompanyOut, UserOut

router = APIRouter()


# ── Backup Log Helpers ─────────────────────────────────────────────────────

BACKUP_LOG_FILE = os.environ.get("BACKUP_DIR", "/backups") + "/backup-logs.json"


def _log_backup_event(event: dict) -> None:
    """Append a backup event to the log file.

    Resolves the log path from the env at call time (rather than using the
    module-level constant) so tests that redirect BACKUP_DIR to a tmp dir
    never touch the real /backups volume.
    """
    log_file = os.environ.get("BACKUP_DIR", "/backups") + "/backup-logs.json"
    logs = []
    if os.path.exists(log_file):
        try:
            with open(log_file) as f:
                logs = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            logs = []
    logs.append(event)
    # Keep last 100 entries
    logs = logs[-100:]
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    with open(log_file, "w") as f:
        json.dump(logs, f, indent=2)


class AdminCreateUser(BaseModel):
    """Superadmin: create a new user."""
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    is_superadmin: bool = False


class AdminAssignCompany(BaseModel):
    """Superadmin: assign a user to a company with a role."""
    company_id: str
    role: str = "accountant"


def _require_superadmin(user: User):
    """Ensure the current user is a superadmin."""
    if not user.is_superadmin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required",
        )


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminCreateUser,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new user (superadmin only)."""
    _require_superadmin(user)
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="An account with this email already exists")
    new_user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        is_active=True,
        is_superadmin=payload.is_superadmin,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return UserOut.model_validate(new_user)


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all users (superadmin only)."""
    _require_superadmin(user)
    users = (
        db.query(User)
        .options(selectinload(User.memberships).selectinload(CompanyMember.company))
        .order_by(User.created_at.desc())
        .all()
    )
    result = []
    for u in users:
        out = AdminUserOut(
            id=u.id,
            email=u.email,
            name=u.name,
            is_active=u.is_active,
            is_superadmin=u.is_superadmin,
            memberships=[
                CompanyMemberBrief(
                    company_id=m.company_id,
                    company_name=m.company.name if m.company else "Unknown",
                    role=m.role,
                )
                for m in (u.memberships or [])
            ],
        )
        result.append(out)
    return result


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(
    user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user details (superadmin only)."""
    _require_superadmin(user)
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut.model_validate(target)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a user (superadmin only)."""
    _require_superadmin(user)

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    # Can't deactivate yourself
    if user_id == user.id and payload.is_active is False:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself",
        )

    # Check if this is the last superadmin
    if target.is_superadmin and payload.is_superadmin is False:
        superadmin_count = db.query(User).filter(User.is_superadmin.is_(True)).count()
        if superadmin_count <= 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove superadmin status from the last superadmin",
            )

    # Check if this is the last active superadmin when deactivating
    if payload.is_active is False and target.is_superadmin:
        active_superadmin_count = db.query(User).filter(
            User.is_superadmin.is_(True), User.is_active.is_(True)
        ).count()
        if active_superadmin_count <= 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate the last active superadmin",
            )

    # Check email uniqueness if changing
    if payload.email and payload.email != target.email:
        existing = db.query(User).filter(User.email == payload.email).first()
        if existing:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )
        target.email = payload.email

    if payload.name is not None:
        target.name = payload.name
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.is_superadmin is not None:
        target.is_superadmin = payload.is_superadmin

    db.commit()
    db.refresh(target)
    return UserOut.model_validate(target)


@router.delete("/users/{user_id}")
def deactivate_user(
    user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete (deactivate) a user (superadmin only)."""
    _require_superadmin(user)

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    # Can't deactivate yourself
    if user_id == user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself",
        )

    # Check if this is the last active superadmin
    if target.is_superadmin:
        active_superadmin_count = db.query(User).filter(
            User.is_superadmin.is_(True), User.is_active.is_(True)
        ).count()
        if active_superadmin_count <= 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate the last active superadmin",
            )

    target.is_active = False
    db.commit()

    # Remove all company memberships
    db.query(CompanyMember).filter(CompanyMember.user_id == user_id).delete()
    db.commit()

    return {"message": f"User {target.email} has been deactivated"}


@router.delete("/users/{user_id}/hard")
def hard_delete_user(
    user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete a user (superadmin only)."""
    _require_superadmin(user)

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")

    if target.is_superadmin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot hard-delete a superadmin")

    db.query(CompanyMember).filter(CompanyMember.user_id == user_id).delete()
    db.delete(target)
    db.commit()

    return {"message": f"User {target.email} has been permanently deleted"}


@router.post("/users/{user_id}/memberships")
def assign_to_company(
    user_id: str,
    payload: AdminAssignCompany,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Assign a user to a company with a role (superadmin only)."""
    _require_superadmin(user)

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    company = db.get(Company, payload.company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")

    if payload.role not in ("accountant", "viewer", "admin", "owner"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    existing = db.query(CompanyMember).filter(
        CompanyMember.company_id == payload.company_id,
        CompanyMember.user_id == user_id,
    ).first()
    if existing:
        if existing.role == payload.role:
            return {"message": f"User {target.email} is already {payload.role} in {company.name}"}
        old_role = existing.role
        existing.role = payload.role
        db.commit()
        return {"message": f"User {target.email} role changed from {old_role} to {payload.role} in {company.name}"}

    member = CompanyMember(
        company_id=payload.company_id,
        user_id=user_id,
        role=payload.role,
    )
    db.add(member)
    db.commit()
    return {"message": f"User {target.email} added to {company.name} as {payload.role}"}


@router.get("/stats")
def get_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get system stats (superadmin only)."""
    _require_superadmin(user)

    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active.is_(True)).count()
    superadmin_count = db.query(User).filter(User.is_superadmin.is_(True)).count()
    total_companies = db.query(CompanyMember).distinct(CompanyMember.company_id).count()

    return {
        "total_users": total_users,
        "active_users": active_users,
        "superadmin_count": superadmin_count,
        "total_companies": total_companies,
    }


# ── Company management (superadmin only) ──────────────────────────────────


class AdminCompanyCreate(BaseModel):
    """Superadmin: create a new company."""
    name: str = Field(..., min_length=1, max_length=255)
    legal_name: str | None = None
    gstin: str | None = None
    state_code: str | None = None
    pan: str | None = None
    address: str | None = None


class AdminCompanyUpdate(BaseModel):
    """Superadmin: update a company."""
    name: str | None = None
    legal_name: str | None = None
    gstin: str | None = None
    state_code: str | None = None
    pan: str | None = None
    address: str | None = None
    is_active: bool | None = None


@router.get("/companies", response_model=list[CompanyOut])
def admin_list_companies(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all companies (superadmin only)."""
    _require_superadmin(user)
    counts = dict(
        db.query(CompanyMember.company_id, func.count(CompanyMember.user_id))
        .group_by(CompanyMember.company_id)
        .all()
    )
    companies = db.query(Company).order_by(Company.name).all()
    result = []
    for c in companies:
        out = CompanyOut.model_validate(c)
        out.member_count = counts.get(c.id, 0)
        result.append(out)
    return result


@router.post("/companies", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
def admin_create_company(
    payload: AdminCompanyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new company (superadmin only)."""
    _require_superadmin(user)

    if payload.gstin:
        existing = db.query(Company).filter(Company.gstin == payload.gstin).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A company with this GSTIN already exists",
            )

    company = Company(
        name=payload.name,
        legal_name=payload.legal_name,
        gstin=payload.gstin,
        state_code=payload.state_code,
        pan=payload.pan,
        address=payload.address,
    )
    db.add(company)
    db.flush()

    # Add superadmin as owner
    db.add(CompanyMember(company_id=company.id, user_id=user.id, role="owner"))
    # Auto-add all other superadmins as owners of this company
    superadmins = db.scalars(
        select(User).where(User.is_superadmin.is_(True), User.id != user.id)
    ).all()
    for sa in superadmins:
        db.add(CompanyMember(company_id=company.id, user_id=sa.id, role="owner"))
    db.commit()
    db.refresh(company)
    # Seed default Indian compliance mapping/templates for the new company.
    from app.services.compliance import ensure_default_schedules, ensure_default_templates
    ensure_default_schedules(db, company.id)
    ensure_default_templates(db, company.id)
    return company


@router.get("/companies/{company_id}", response_model=CompanyOut)
def admin_get_company(
    company_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get company details (superadmin only)."""
    _require_superadmin(user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


@router.patch("/companies/{company_id}", response_model=CompanyOut)
def admin_update_company(
    company_id: str,
    payload: AdminCompanyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a company (superadmin only)."""
    _require_superadmin(user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")

    data = payload.model_dump(exclude_unset=True)
    if "gstin" in data and data["gstin"] and data["gstin"] != company.gstin:
        clash = db.query(Company).filter(Company.gstin == data["gstin"]).first()
        if clash:
            raise HTTPException(
                status.HTTP_409_CONFLICT, detail="GSTIN already in use"
            )

    for k, v in data.items():
        setattr(company, k, v)

    db.commit()
    db.refresh(company)
    return company


@router.delete("/companies/{company_id}")
def admin_delete_company(
    company_id: str,
    force: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a company (superadmin only).

    By default, refuses to delete companies that still have financial data.
    The company must be deactivated first, and all vouchers, ledgers,
    and other financial records must be removed or exported.

    Use ?force=true to skip the financial data check and delete everything.
    """
    from app.models.accounting import Ledger, FinancialYear
    from app.models.voucher import Voucher

    _require_superadmin(user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")

    if company.is_active:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Company must be deactivated before deletion. "
            "Set is_active=false via PATCH /admin/companies/{id} first.",
        )

    # Check for financial data (skip if force=true)
    if not force:
        voucher_count = db.query(Voucher).filter(Voucher.company_id == company_id).count()
        ledger_count = db.query(Ledger).filter(Ledger.company_id == company_id).count()
        fy_count = db.query(FinancialYear).filter(FinancialYear.company_id == company_id).count()

        blockers = []
        if voucher_count:
            blockers.append(f"{voucher_count} voucher(s)")
        if ledger_count:
            blockers.append(f"{ledger_count} ledger(s)")
        if fy_count:
            blockers.append(f"{fy_count} financial year(s)")

        if blockers:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete company with existing data: {', '.join(blockers)}. "
                "Export or remove all financial data first, or use ?force=true.",
            )

    # Delete company members first, then company (cascade handles the rest)
    db.query(CompanyMember).filter(CompanyMember.company_id == company_id).delete()

    # If force, delete dependent records in correct order (respecting FK constraints)
    if force:
        from app.models.accounting import Ledger, FinancialYear, AccountGroup, Party, HsnSac, GstRegistration, GstReturn, GstChallan
        from app.models.masters import Unit, CostCentre, CostCategory
        from app.models.stock import StockGroup, StockItem, StockEntry, StockBalance
        from app.models.tds_tcs import TdsTcsSection, TdsTcsEntry, TdsTcsReturn
        from app.models.voucher import Voucher, VoucherLine
        from app.models.recurring_template import RecurringTemplate
        from app.models.payment_allocation import PaymentAllocation
        from app.models.audit import AuditLog
        from app.models.attachment import DocumentAttachment
        from app.models.bank_reconciliation import BankStatementLine, BankReconciliation
        from app.models.einvoice import EInvoice
        from app.models.eway_bill import EwayBill

        # Delete in order from most dependent to least
        for model in [
            AuditLog, DocumentAttachment, EInvoice, EwayBill,
            PaymentAllocation, VoucherLine, Voucher, RecurringTemplate,
            BankStatementLine, BankReconciliation,
            TdsTcsEntry, TdsTcsReturn, TdsTcsSection,
            GstReturn, GstChallan, GstRegistration,
            StockEntry, StockBalance, StockItem, StockGroup,
            Ledger, Party, HsnSac, CostCentre, CostCategory, Unit,
            FinancialYear, AccountGroup,
        ]:
            try:
                db.query(model).filter(model.company_id == company_id).delete()
            except Exception:
                pass  # Table may not have company_id or other issues

    db.delete(company)
    db.commit()

    return {"message": f"Company '{company.name}' has been deleted"}


# ── Backup status ─────────────────────────────────────────────────────────


def _gdrive_is_enabled() -> bool:
    """Whether GDrive sync is currently active.

    The source of truth is BOTH the GDRIVE_ENABLED env var AND the
    gdrive-enabled flag file in the backup dir — the backup container picks
    up the flag without a restart, so a toggle via the UI can leave the env
    var stale (and after an API restart the env var reverts to the compose
    default while the flag persists). Settings and trigger must agree with
    what backup.sh actually does.
    """
    import os

    if os.environ.get("GDRIVE_ENABLED", "false").lower() == "true":
        return True
    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    return os.path.exists(os.path.join(backup_dir, "gdrive-enabled"))


class BackupFileInfo(BaseModel):
    filename: str
    size_bytes: int
    created_at: str
    type: str  # "database" or "uploads"


class GDriveSyncStatus(BaseModel):
    gdrive_enabled: bool
    last_sync_at: str | None = None
    last_sync_status: str | None = None
    last_sync_files: list[str] = []
    last_sync_duration_seconds: int | None = None
    last_error: str | None = None


class DiskUsage(BaseModel):
    total: int
    used: int
    free: int


class BackupStatus(BaseModel):
    backup_dir: str
    database_backups: list[BackupFileInfo]
    uploads_backups: list[BackupFileInfo]
    total_backups: int
    gdrive_sync: GDriveSyncStatus | None = None
    disk_usage: DiskUsage | None = None


@router.get("/backups", response_model=BackupStatus)
def get_backup_status(
    user: User = Depends(get_current_user),
):
    """Get status of available backups (superadmin only)."""
    import glob as glob_mod
    import json
    import os
    from datetime import datetime, timezone

    _require_superadmin(user)

    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    db_pattern = os.path.join(backup_dir, "*.sql.gz")
    up_pattern = os.path.join(backup_dir, "*_uploads_*.tar.gz")

    db_files = sorted(glob_mod.glob(db_pattern), key=lambda p: os.path.getmtime(p), reverse=True)
    up_files = sorted(glob_mod.glob(up_pattern), key=lambda p: os.path.getmtime(p), reverse=True)

    def _file_info(path: str, file_type: str) -> BackupFileInfo:
        stat = os.stat(path)
        mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        return BackupFileInfo(
            filename=os.path.basename(path),
            size_bytes=stat.st_size,
            created_at=mtime.isoformat(),
            type=file_type,
        )

    db_infos = [_file_info(f, "database") for f in db_files]
    up_infos = [_file_info(f, "uploads") for f in up_files]

    # Read GDrive sync status if available
    gdrive_sync = None
    status_path = os.path.join(backup_dir, "sync-status.json")
    if os.path.exists(status_path):
        try:
            with open(status_path) as f:
                status_data = json.load(f)
            gdrive_sync = GDriveSyncStatus(**status_data)
        except (json.JSONDecodeError, KeyError):
            pass

    # Volume disk usage for the UI's space card (guarded — a read error on
    # the mount should never break the whole status payload).
    import shutil
    disk_usage = None
    try:
        du = shutil.disk_usage(backup_dir)
        disk_usage = DiskUsage(total=du.total, used=du.used, free=du.free)
    except OSError:
        disk_usage = None

    return BackupStatus(
        backup_dir=backup_dir,
        database_backups=db_infos,
        uploads_backups=up_infos,
        total_backups=len(db_infos) + len(up_infos),
        gdrive_sync=gdrive_sync,
        disk_usage=disk_usage,
    )


class BackupLogEntry(BaseModel):
    type: str
    triggered_by: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    error: str | None = None
    filename: str | None = None
    gdrive_enabled: bool | None = None


@router.get("/backups/logs")
def get_backup_logs(
    user: User = Depends(get_current_user),
):
    """Get backup operation logs (superadmin only)."""
    _require_superadmin(user)

    if not os.path.exists(BACKUP_LOG_FILE):
        return []

    try:
        with open(BACKUP_LOG_FILE) as f:
            logs = json.load(f)
        return logs[-50:]  # Return last 50 entries
    except (json.JSONDecodeError, FileNotFoundError):
        return []


@router.get("/backups/download/{filename}")
def download_backup(
    filename: str,
    user: User = Depends(get_current_user),
):
    """Download a backup file (superadmin only).

    Validates the filename to prevent path traversal.
    """
    import re

    _require_superadmin(user)

    backup_dir = os.environ.get("BACKUP_DIR", "/backups")

    # Validate filename - only allow alphanumeric, underscores, hyphens, and dots
    if not re.match(r'^[\w\-\.]+$', filename) or '..' in filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid filename")

    file_path = os.path.join(backup_dir, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Backup file not found")

    from fastapi.responses import FileResponse
    media_type = "application/gzip" if filename.endswith(".gz") else "application/octet-stream"
    return FileResponse(file_path, media_type=media_type, filename=filename)


@router.delete("/backups/{filename}")
def delete_backup(
    filename: str,
    user: User = Depends(get_current_user),
):
    """Delete a single backup file (superadmin only).

    Lets admins clean up individual database/uploads backups from the Backup
    Management page without touching the volume directly. Uses the same
    filename guard as the download endpoint to prevent path traversal.
    """
    import re

    _require_superadmin(user)

    backup_dir = os.environ.get("BACKUP_DIR", "/backups")

    # Validate filename - only allow alphanumeric, underscores, hyphens, and dots
    if not re.match(r'^[\w\-\.]+$', filename) or '..' in filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid filename")

    # Only backup files (as listed by GET /admin/backups) may be deleted —
    # never config/state files that also live in the backup dir (the GDrive
    # token, sync-status.json, backup-progress.json, logs, flags, etc.). The
    # GDrive token has its own dedicated DELETE endpoint.
    is_db_backup = filename.endswith(".sql.gz")
    is_uploads_backup = filename.endswith(".tar.gz") and "_uploads_" in filename
    if not (is_db_backup or is_uploads_backup):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Not a backup file")

    file_path = os.path.join(backup_dir, filename)
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Backup file not found")

    try:
        bytes_freed = os.path.getsize(file_path)
        os.remove(file_path)
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Backup file not found")
    _log_backup_event({
        "type": "backup_deleted",
        "triggered_by": user.email,
        "filename": filename,
    })
    return {
        "message": f"Backup '{filename}' deleted",
        "deleted": filename,
        "bytes_freed": bytes_freed,
    }


@router.post("/backups/prune")
def prune_backups(
    user: User = Depends(get_current_user),
):
    """Delete backups older than the retention period (superadmin only).

    Mirrors backup.sh's rotation for on-demand cleanup: only real backup
    files (as listed by GET /admin/backups — `*.sql.gz` and
    `*_uploads_*.tar.gz`) older than BACKUP_RETENTION_DAYS are removed.
    Config/state files in the backup dir are never touched. Returns the
    pruned filenames + bytes freed so the UI can confirm the result.
    """
    import glob as glob_mod
    import time

    _require_superadmin(user)

    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    # Clamp to >= 1 so a misconfigured 0 (or negative) can never mean
    # "delete everything" — matches `-mtime +N` rotation semantics. Fall
    # back to 30 if the env var is ever non-numeric (hand-edited .env).
    try:
        retention_days = max(1, int(os.environ.get("BACKUP_RETENTION_DAYS", "30")))
    except (TypeError, ValueError):
        retention_days = 30

    db_pattern = os.path.join(backup_dir, "*.sql.gz")
    up_pattern = os.path.join(backup_dir, "*_uploads_*.tar.gz")
    candidate_paths = glob_mod.glob(db_pattern) + glob_mod.glob(up_pattern)

    cutoff = time.time() - retention_days * 86400
    pruned = []
    bytes_freed = 0
    for path in candidate_paths:
        try:
            if os.path.getmtime(path) < cutoff:
                bytes_freed += os.path.getsize(path)
                os.remove(path)
                pruned.append(os.path.basename(path))
        except OSError:
            continue  # vanished or unreadable — skip, never fatal

    if pruned:
        _log_backup_event({
            "type": "backup_pruned",
            "triggered_by": user.email,
            "filename": f"{len(pruned)} file(s) · {_format_backup_bytes(bytes_freed)}",
        })

    return {
        "pruned": pruned,
        "count": len(pruned),
        "bytes_freed": bytes_freed,
        "retention_days": retention_days,
    }


def _format_backup_bytes(num_bytes: int) -> str:
    """Compact human-readable size for log summaries (e.g. '12.4 MB')."""
    for unit in ("B", "KB", "MB", "GB"):
        if num_bytes < 1024 or unit == "GB":
            return f"{num_bytes:.1f} {unit}" if unit != "B" else f"{num_bytes} B"
        num_bytes /= 1024
    return f"{num_bytes} B"


class BackupTriggerResponse(BaseModel):
    status: str
    message: str
    gdrive_enabled: bool


def _build_backup_subprocess_env(gdrive_enabled: bool) -> dict:
    """Build the subprocess env for backup.sh.

    Includes POSTGRES_* (parsed from DATABASE_URL when missing) so pg_dump can
    authenticate, the live gdrive toggle, and the UI retention setting mapped
    to the env var backup.sh actually reads (RETENTION_DAYS).
    """
    import os

    sub_env = os.environ.copy()
    if not sub_env.get("POSTGRES_PASSWORD"):
        from urllib.parse import urlparse
        db_url = sub_env.get("DATABASE_URL", "")
        if db_url:
            parsed = urlparse(db_url.replace("+psycopg", ""))
            sub_env.setdefault("POSTGRES_HOST", parsed.hostname or "db")
            sub_env.setdefault("POSTGRES_PORT", str(parsed.port or 5432))
            sub_env.setdefault("POSTGRES_USER", parsed.username or "zledger")
            sub_env.setdefault("POSTGRES_PASSWORD", parsed.password or "")
            sub_env.setdefault("POSTGRES_DB", (parsed.path or "/zledger").lstrip("/"))
    # Reflect the live gdrive toggle (env var OR flag file) for backup.sh
    if gdrive_enabled:
        sub_env["GDRIVE_ENABLED"] = "true"

    # Map the UI retention setting (BACKUP_RETENTION_DAYS) to the env var
    # backup.sh actually reads (RETENTION_DAYS). Without this, manual
    # backups always used the script's 30-day default and ignored the
    # retention_days chosen in Backup Settings.
    retention = sub_env.get("RETENTION_DAYS") or sub_env.get("BACKUP_RETENTION_DAYS")
    if retention:
        sub_env["RETENTION_DAYS"] = retention
    return sub_env


@router.post("/backup/trigger", response_model=BackupTriggerResponse)
def trigger_backup(
    user: User = Depends(get_current_user),
):
    """Trigger an immediate database + uploads backup (superadmin only).

    Runs the backup in a background thread: pg_dump, uploads tarball,
    optional Google Drive sync. Returns immediately.
    """
    import os
    import subprocess
    import threading

    _require_superadmin(user)

    backup_script = os.path.join(os.path.dirname(__file__), "..", "..", "..", "scripts", "backup.sh")
    if not os.path.exists(backup_script):
        # Try alternate path inside container (volume mount)
        backup_script = "/usr/local/bin/backup.sh"
        if not os.path.exists(backup_script):
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Backup script not found",
            )

    gdrive_enabled = _gdrive_is_enabled()

    sub_env = _build_backup_subprocess_env(gdrive_enabled)

    def _run_backup():
        from datetime import datetime, timezone
        start_time = datetime.now(timezone.utc).isoformat()
        _log_backup_event({
            "type": "backup_started",
            "triggered_by": user.email,
            "started_at": start_time,
        })
        # Clear any stale progress file left by a previous failed run so the
        # UI never shows the old failure for the new backup.
        progress_path = os.path.join(os.environ.get("BACKUP_DIR", "/backups"), "backup-progress.json")
        try:
            if os.path.exists(progress_path):
                os.remove(progress_path)
        except OSError:
            pass
        try:
            # Generate rclone config if GDrive is enabled
            rclone_conf_dir = os.path.expanduser("~/.config/rclone")
            rclone_conf_path = os.path.join(rclone_conf_dir, "rclone.conf")
            token_file = os.environ.get("GDRIVE_TOKEN_FILE", "/backups/gdrive-token.json")

            if gdrive_enabled:
                os.makedirs(rclone_conf_dir, exist_ok=True)
                if os.path.exists(token_file):
                    with open(token_file) as tf:
                        token_content = tf.read().strip()
                    with open(rclone_conf_path, "w") as rf:
                        rf.write(f"[gdrive]\ntype = drive\nscope = drive\ntoken = {token_content}\n")
                    print(f"rclone config generated from {token_file}")
                else:
                    print(f"WARNING: GDrive enabled but token file not found: {token_file}")

            result = subprocess.run(
                ["bash", backup_script],
                capture_output=True,
                text=True,
                timeout=600,
                env=sub_env,
            )
            end_time = datetime.now(timezone.utc).isoformat()
            if result.returncode != 0:
                _log_backup_event({
                    "type": "backup_failed",
                    "triggered_by": user.email,
                    "started_at": start_time,
                    "completed_at": end_time,
                    "error": result.stderr[-1000:] if result.stderr else "Unknown error",
                })
                print(f"Backup script error: {result.stderr[-2000:]}")
            else:
                _log_backup_event({
                    "type": "backup_completed",
                    "triggered_by": user.email,
                    "started_at": start_time,
                    "completed_at": end_time,
                    "gdrive_enabled": gdrive_enabled,
                })
                print(f"Manual backup completed successfully")
        except Exception as e:
            end_time = datetime.now(timezone.utc).isoformat()
            _log_backup_event({
                "type": "backup_failed",
                "triggered_by": user.email,
                "started_at": start_time,
                "completed_at": end_time,
                "error": str(e),
            })
            print(f"Manual backup failed: {e}")

    thread = threading.Thread(target=_run_backup, daemon=True)
    thread.start()

    return BackupTriggerResponse(
        status="started",
        message="Backup started. Check the backup status page for progress.",
        gdrive_enabled=gdrive_enabled,
    )


class BackupProgress(BaseModel):
    step: str
    step_label: str
    status: str
    timestamp: str
    dump_file: str | None = None
    uploads_file: str | None = None


@router.get("/backup/progress")
def get_backup_progress(
    user: User = Depends(get_current_user),
):
    """Get the progress of a running backup (superadmin only).

    Reads the progress file written by backup.sh during execution.
    Returns 204 No Content if no backup is in progress.
    """
    _require_superadmin(user)

    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    progress_file = os.path.join(backup_dir, "backup-progress.json")

    if not os.path.exists(progress_file):
        raise HTTPException(status.HTTP_204_NO_CONTENT, detail="No backup in progress")

    try:
        with open(progress_file) as f:
            data = json.load(f)
        return BackupProgress(**data)
    except (json.JSONDecodeError, KeyError, FileNotFoundError):
        raise HTTPException(status.HTTP_204_NO_CONTENT, detail="No backup in progress")


# ── Backup restore ────────────────────────────────────────────────────────


class RestoreUploadResponse(BaseModel):
    database_file: str
    uploads_file: str | None = None
    database_size: int
    uploads_size: int | None = None


class RestoreExecuteRequest(BaseModel):
    database_file: str
    uploads_file: str | None = None
    confirm: str


class RestoreExecuteResponse(BaseModel):
    status: str
    message: str


@router.post("/restore/upload", response_model=RestoreUploadResponse)
async def upload_restore_files(
    database_file: UploadFile = File(...),
    uploads_file: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
):
    """Upload backup files for restore (superadmin only)."""
    import subprocess
    import os

    _require_superadmin(user)

    backup_dir = os.environ.get("BACKUP_DIR", "/backups")

    # Validate database file: extension AND no path separators (the client
    # controls the filename — a "../" would escape the backup dir on save).
    if not database_file.filename or not database_file.filename.endswith(".sql.gz"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Database backup must be a .sql.gz file",
        )
    safe_name = os.path.basename(database_file.filename.replace("\\", "/"))
    if safe_name != database_file.filename or ".." in safe_name:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename",
        )

    # Save database file
    db_path = os.path.join(backup_dir, safe_name)
    db_content = await database_file.read()
    with open(db_path, "wb") as f:
        f.write(db_content)

    # Validate it's valid gzip
    try:
        result = subprocess.run(
            ["gunzip", "-t", db_path],
            capture_output=True, timeout=30,
        )
        if result.returncode != 0:
            os.remove(db_path)
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Database file is not a valid gzip archive",
            )
    except subprocess.TimeoutExpired:
        os.remove(db_path)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Validation timed out",
        )

    # Save uploads file if provided
    up_path = None
    up_size = None
    if uploads_file and uploads_file.filename:
        if not uploads_file.filename.endswith(".tar.gz"):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Uploads backup must be a .tar.gz file",
            )
        up_safe_name = os.path.basename(uploads_file.filename.replace("\\", "/"))
        if up_safe_name != uploads_file.filename or ".." in up_safe_name:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Invalid filename",
            )
        up_path = os.path.join(backup_dir, up_safe_name)
        up_content = await uploads_file.read()
        with open(up_path, "wb") as f:
            f.write(up_content)
        # Validate gzip
        try:
            result = subprocess.run(
                ["gunzip", "-t", up_path],
                capture_output=True, timeout=30,
            )
            if result.returncode != 0:
                os.remove(up_path)
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="Uploads file is not a valid gzip archive",
                )
        except subprocess.TimeoutExpired:
            os.remove(up_path)
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Validation timed out",
            )
        up_size = len(up_content)

    return RestoreUploadResponse(
        database_file=database_file.filename,
        uploads_file=uploads_file.filename if uploads_file else None,
        database_size=len(db_content),
        uploads_size=up_size,
    )


@router.post("/restore/execute", response_model=RestoreExecuteResponse)
def execute_restore(
    payload: RestoreExecuteRequest,
    user: User = Depends(get_current_user),
):
    """Execute the restore from uploaded backup files (superadmin only).

    Runs the restore in a background thread: drops DB, restores from pg_dump,
    and restores uploads. The API container restarts via Docker healthcheck.
    """
    import os
    import subprocess
    import threading
    import time
    from datetime import datetime, timezone

    _require_superadmin(user)

    if payload.confirm != "RESTORE":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Type 'RESTORE' to confirm",
        )

    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    uploads_dir = os.environ.get("UPLOADS_DIR", "/app/uploads")

    # Filename guard: never allow escaping the backup dir (same rule as the
    # download endpoint). These names came from a client, not from the upload.
    def _safe_backup_filename(name: str) -> str:
        base = os.path.basename(name.replace("\\", "/"))
        if base != name or ".." in base:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid filename")
        return base

    db_path = os.path.join(backup_dir, _safe_backup_filename(payload.database_file))

    if not os.path.exists(db_path):
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="Database backup file not found",
        )

    up_path = None
    if payload.uploads_file:
        up_path = os.path.join(backup_dir, _safe_backup_filename(payload.uploads_file))
        if not os.path.exists(up_path):
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="Uploads backup file not found",
            )

    # Validate the dump is a real pg_dump archive BEFORE dropping the DB.
    # Restoring a junk file would drop the database and then fail, leaving
    # the instance with an empty (unrecoverable) schema.
    try:
        import gzip as gzip_mod
        with gzip_mod.open(db_path, "rb") as f:
            magic = f.read(5)
    except (OSError, gzip_mod.BadGzipFile, EOFError):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Database backup is not a valid gzip archive",
        )
    if magic != b"PGDMP":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Database backup is not a valid pg_dump archive (PGDMP magic not found)",
        )

    db_url = os.environ.get("DATABASE_URL", "")

    def _run_restore():
        """Background restore: drop DB, restore via pg_restore, extract uploads."""
        import gzip
        import io
        import tarfile
        import psycopg
        from urllib.parse import urlparse

        # Parse DB URL to get connection params
        # Format: postgresql+psycopg://user:pass@host:port/dbname
        parsed = urlparse(db_url.replace("postgresql+psycopg://", "postgres://"))
        host = parsed.hostname or "db"
        port = parsed.port or 5432
        user = parsed.username or "zledger"
        password = parsed.password or "zledger"
        dbname = parsed.path.lstrip("/") or "zledger"

        time.sleep(2)  # Give API time to send response

        try:
            # Connect to postgres (not the app DB) to drop/recreate
            conn = psycopg.connect(
                host=host, port=port, user=user, password=password,
                dbname="postgres",
                autocommit=True,
            )
            with conn.cursor() as cur:
                # Terminate connections
                cur.execute(
                    "SELECT pg_terminate_backend(pid) "
                    "FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
                    (dbname,),
                )
                # Drop and recreate
                cur.execute(f"DROP DATABASE IF EXISTS {dbname}")
                cur.execute(f"CREATE DATABASE {dbname}")
            conn.close()

            # Restore database via pg_restore subprocess
            import subprocess
            env = os.environ.copy()
            env["PGPASSWORD"] = password
            result = subprocess.run(
                ["sh", "-c", f"gunzip -c {db_path} | pg_restore -h {host} -p {port} -U {user} -d {dbname} --no-owner --no-privileges --verbose 2>&1"],
                timeout=300,
                capture_output=True,
                text=True,
                env=env,
            )
            if result.returncode != 0:
                print(f"pg_restore warnings/errors (non-fatal): {result.stdout[-2000:] if result.stdout else ''}")
                print(f"pg_restore stderr: {result.stderr[-1000:] if result.stderr else ''}")

            # Run ANALYZE
            conn = psycopg.connect(
                host=host, port=port, user=user, password=password,
                dbname=dbname,
                autocommit=True,
            )
            with conn.cursor() as cur:
                cur.execute("ANALYZE")
            conn.close()

            # Restore uploads
            if up_path and os.path.exists(up_path):
                with tarfile.open(up_path, "r:gz") as tar:
                    tar.extractall(path=os.path.dirname(uploads_dir))

        except Exception as e:
            _log_backup_event({
                "type": "restore_failed",
                "triggered_by": user.email,
                "filename": payload.database_file,
                "error": str(e)[-500:],
            })
            print(f"Restore error: {e}")

    # Audit trail: record the restore attempt BEFORE the background thread
    # runs — the DB drop that follows makes the process unreliable, so the
    # start entry is the guaranteed record of what was restored and who did it.
    _log_backup_event({
        "type": "restore_started",
        "triggered_by": user.email,
        "filename": payload.database_file,
        "started_at": datetime.now(timezone.utc).isoformat(),
    })

    thread = threading.Thread(target=_run_restore, daemon=True)
    thread.start()

    return RestoreExecuteResponse(
        status="restoring",
        message="Restore in progress. The API will restart shortly.",
    )


# ─── Backup Settings & GDrive ──────────────────────────────────────────────


class BackupSettingsResponse(BaseModel):
    backup_dir: str
    backup_interval_hours: int
    retention_days: int
    gdrive_enabled: bool
    gdrive_token_set: bool
    gdrive_account_email: str | None = None


@router.get("/backup/settings", response_model=BackupSettingsResponse)
def get_backup_settings(
    user: User = Depends(get_current_user),
):
    """Get current backup settings (superadmin only)."""
    _require_superadmin(user)
    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    token_file = os.path.join(backup_dir, "gdrive-token.json")
    return BackupSettingsResponse(
        backup_dir=backup_dir,
        backup_interval_hours=int(os.environ.get("BACKUP_INTERVAL_HOURS", "24")),
        retention_days=int(os.environ.get("BACKUP_RETENTION_DAYS", "30")),
        gdrive_enabled=_gdrive_is_enabled(),
        gdrive_token_set=os.path.exists(token_file),
        gdrive_account_email=_get_gdrive_account_email(),
    )


class BackupSettingsUpdate(BaseModel):
    backup_interval_hours: int | None = None
    retention_days: int | None = None
    gdrive_enabled: bool | None = None


@router.put("/backup/settings", response_model=BackupSettingsResponse)
def update_backup_settings(
    payload: BackupSettingsUpdate,
    user: User = Depends(get_current_user),
):
    """Update backup settings (superadmin only). Writes to .env file."""
    _require_superadmin(user)
    # Always apply updates to os.environ (works even without an .env file)
    env_file = os.environ.get("ENV_FILE", "/app/.env")
    updated_lines = []
    if os.path.exists(env_file):
        with open(env_file) as f:
            updated_lines = list(f.readlines())

    def _set_env(key: str, value: str):
        for i, line in enumerate(updated_lines):
            if line.startswith(f"{key}="):
                updated_lines[i] = f"{key}={value}\n"
                return
        updated_lines.append(f"{key}={value}\n")

    if payload.backup_interval_hours is not None:
        _set_env("BACKUP_INTERVAL_HOURS", str(payload.backup_interval_hours))
        os.environ["BACKUP_INTERVAL_HOURS"] = str(payload.backup_interval_hours)
    if payload.retention_days is not None:
        _set_env("BACKUP_RETENTION_DAYS", str(payload.retention_days))
        os.environ["BACKUP_RETENTION_DAYS"] = str(payload.retention_days)
    if payload.gdrive_enabled is not None:
        val = "true" if payload.gdrive_enabled else "false"
        _set_env("GDRIVE_ENABLED", val)
        os.environ["GDRIVE_ENABLED"] = val
        # Also write the gdrive-enabled file for the backup container to pick up
        backup_dir = os.environ.get("BACKUP_DIR", "/backups")
        gdrive_flag = os.path.join(backup_dir, "gdrive-enabled")
        if payload.gdrive_enabled:
            with open(gdrive_flag, "w") as f:
                f.write("true")
        else:
            if os.path.exists(gdrive_flag):
                os.remove(gdrive_flag)

    # Persist to .env if it exists (or is configured); otherwise env stays in-memory
    if os.path.exists(os.path.dirname(env_file)) or os.path.exists(env_file):
        try:
            with open(env_file, "w") as f:
                f.writelines(updated_lines)
        except OSError:
            pass
    return get_backup_settings(user)


class GDriveTokenSave(BaseModel):
    token: str = Field(..., min_length=10)


@router.post("/backup/gdrive-token")
def save_gdrive_token(
    payload: GDriveTokenSave,
    user: User = Depends(get_current_user),
):
    """Save GDrive rclone token (superadmin only)."""
    _require_superadmin(user)
    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    token_file = os.path.join(backup_dir, "gdrive-token.json")
    with open(token_file, "w") as f:
        f.write(payload.token.strip())
    # Auto-enable GDrive when saving a token
    os.environ["GDRIVE_ENABLED"] = "true"
    # Write the gdrive-enabled flag file so the backup container picks it up
    gdrive_flag = os.path.join(backup_dir, "gdrive-enabled")
    with open(gdrive_flag, "w") as f:
        f.write("true")
    # Persist to .env if available (no-op if env file missing)
    env_file = os.environ.get("ENV_FILE", "/app/.env")
    if os.path.exists(env_file):
        with open(env_file) as f:
            lines = f.readlines()
        found = False
        for i, line in enumerate(lines):
            if line.startswith("GDRIVE_ENABLED="):
                lines[i] = "GDRIVE_ENABLED=true\n"
                found = True
                break
        if not found:
            lines.append("GDRIVE_ENABLED=true\n")
        with open(env_file, "w") as f:
            f.writelines(lines)
    return get_backup_settings(user)


@router.delete("/backup/gdrive-token")
def clear_gdrive_token(
    user: User = Depends(get_current_user),
):
    """Clear GDrive rclone token and disable sync (superadmin only).

    Removes the token file, the gdrive-enabled flag file AND flips the env
    var (persisted to .env when present). Without this the backup container
    would keep trying to sync with a missing token on every cycle.
    """
    _require_superadmin(user)
    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    token_file = os.path.join(backup_dir, "gdrive-token.json")
    if os.path.exists(token_file):
        os.remove(token_file)

    # Disable sync everywhere: flag file (read by the backup container),
    # env var (read by this API), and .env (survives API restarts).
    gdrive_flag = os.path.join(backup_dir, "gdrive-enabled")
    if os.path.exists(gdrive_flag):
        os.remove(gdrive_flag)
    os.environ["GDRIVE_ENABLED"] = "false"

    env_file = os.environ.get("ENV_FILE", "/app/.env")
    if os.path.exists(env_file):
        try:
            with open(env_file) as f:
                lines = f.readlines()
            found = False
            for i, line in enumerate(lines):
                if line.startswith("GDRIVE_ENABLED="):
                    lines[i] = "GDRIVE_ENABLED=false\n"
                    found = True
                    break
            if not found:
                lines.append("GDRIVE_ENABLED=false\n")
            with open(env_file, "w") as f:
                f.writelines(lines)
        except OSError:
            pass
    return {"status": "ok", "message": "GDrive token cleared and sync disabled."}


def _get_gdrive_account_email() -> str | None:
    """Read account email from stored token file."""
    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    token_file = os.path.join(backup_dir, "gdrive-token.json")
    if not os.path.exists(token_file):
        return None
    try:
        with open(token_file) as f:
            data = json.load(f)
        return data.get("account_email")
    except (json.JSONDecodeError, IOError):
        return None


@router.post("/backup/gdrive-test")
def test_gdrive_connection(
    user: User = Depends(get_current_user),
):
    """Test GDrive token by exercising rclone (superadmin only).

    Mirrors exactly what backup.sh does: writes an rclone.conf with the
    stored token and runs rclone against the gdrive remote. rclone will
    auto-refresh an expired access_token using the refresh_token, so a
    success here means the next backup sync will also succeed. On success
    it also records the connected Google account email on the token file
    so the dashboard can display it.
    """
    import json
    import subprocess
    _require_superadmin(user)
    backup_dir = os.environ.get("BACKUP_DIR", "/backups")
    token_file = os.path.join(backup_dir, "gdrive-token.json")
    if not os.path.exists(token_file):
        return {"status": "error", "message": "No GDrive token found. Save a token first."}
    try:
        with open(token_file) as f:
            token_data = json.load(f)
    except json.JSONDecodeError:
        return {"status": "error", "message": "Token is not valid JSON"}
    if "access_token" not in token_data:
        return {"status": "error", "message": "Token missing access_token field"}
    has_refresh = bool(token_data.get("refresh_token"))
    remote_path = os.environ.get("GDRIVE_REMOTE_PATH", "zledger-backups")

    # Build a private rclone config so we don't clash with other runs
    import tempfile
    cfg_dir = tempfile.mkdtemp(prefix="rclone-test-")
    cfg_path = os.path.join(cfg_dir, "rclone.conf")
    with open(token_file) as f:
        token_content = f.read().strip()
    with open(cfg_path, "w") as f:
        f.write("[gdrive]\ntype = drive\nscope = drive\ntoken = ")
        f.write(token_content)
        f.write("\n")

    try:
        # `mkdir` verifies auth (auto-refreshing via refresh_token) and is
        # cheap. We retry on transient quota 429s which are common on rclone's
        # shared client_id.
        result = subprocess.run(
            [
                "rclone", "--config", cfg_path,
                "--low-level-retries", "5",
                "--retries", "1",
                "mkdir", f"gdrive:{remote_path}/",
            ],
            capture_output=True, text=True, timeout=60,
        )
    except Exception as e:
        # subprocess timed out or couldn't start — distinct from rclone
        # rejecting the token. Don't tell the user to re-authorize.
        try:
            os.remove(cfg_path)
            os.rmdir(cfg_dir)
        except OSError:
            pass
        return {
            "status": "error",
            "message": f"GDrive connection check could not complete ({e}). Try again in a moment.",
            "account_email": None,
        }

    # rclone writes the (possibly refreshed) token back into its config file
    # after auto-renewing the access_token, so read it back before we clean up.
    refreshed_token = None
    try:
        with open(cfg_path) as f:
            cfg_text = f.read()
        marker = "\ntoken = "
        idx = cfg_text.find(marker)
        if idx != -1:
            refreshed_token = json.loads(cfg_text[idx + len(marker):].strip())
    except (OSError, ValueError):
        pass
    finally:
        try:
            os.remove(cfg_path)
            os.rmdir(cfg_dir)
        except OSError:
            pass

    if result.returncode != 0:
        stderr_tail = (result.stderr or "").strip().splitlines()
        stderr_tail = [
            l
            for l in stderr_tail
            if "shared Google Drive client_id" not in l
            and "making-your-own-client-id" not in l
        ]
        detail = stderr_tail[-1] if stderr_tail else f"rclone exited with code {result.returncode}"
        # 403 quota != bad token; 401/403 authError == token issue
        quota = "quota" in (result.stderr or "").lower() or "rateLimit" in (result.stderr or "")
        msg = f"GDrive connection failed: {detail}. "
        if quota:
            msg += "Google is rate-limiting the shared rclone client_id right now — try again in a minute. (Backups themselves retry with backoff.)"
        elif not has_refresh:
            msg += "This token has no refresh_token, so it cannot be auto-renewed. Re-run 'rclone authorize drive' and paste the FULL token JSON (it must include refresh_token)."
        else:
            msg += "Re-run 'rclone authorize drive' and paste the fresh full token."
        return {"status": "error", "message": msg, "account_email": None}

    # Persist the refreshed token (rclone renewed the access_token for us)
    if refreshed_token:
        token_data.update(refreshed_token)
        try:
            with open(token_file, "w") as f:
                json.dump(token_data, f)
        except OSError:
            pass

    # Now the token file holds the live access_token — fetch the account email.
    account_email = token_data.get("account_email")
    if not account_email:
        # The token only has the `drive` scope (not userinfo.email), so use
        # the Drive about endpoint which returns the authenticated user's
        # email with the scope we already have. Retry once on quota 403/429.
        import urllib.request, urllib.error, time
        for attempt in range(3):
            try:
                req = urllib.request.Request(
                    "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",
                    headers={"Authorization": f"Bearer {token_data['access_token']}"},
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    user = json.loads(resp.read()).get("user", {})
                    account_email = user.get("emailAddress")
                if account_email or attempt == 2:
                    break
            except urllib.error.HTTPError as e:
                if e.code in (403, 429) and attempt < 2:
                    time.sleep(2)
                    continue
                break
            except Exception:
                break
    if account_email:
        token_data["account_email"] = account_email
        try:
            with open(token_file, "w") as f:
                json.dump(token_data, f)
        except OSError:
            pass
    msg = f"GDrive connected as {account_email}." if account_email else "GDrive connection OK."
    if not has_refresh:
        msg += " WARNING: token has no refresh_token — it will stop working when the access_token expires. Re-run 'rclone authorize drive' and paste the full token."
    return {"status": "ok", "message": msg, "account_email": account_email}
