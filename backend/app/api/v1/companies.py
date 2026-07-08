"""Company endpoints: create, list (for current user), get, update, logo.

Membership: the creating user becomes an ``owner`` of the new company.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import Company, CompanyMember, User
from app.models.voucher_numbering import VoucherNumbering
from app.schemas.member import CompanyRole
from app.schemas.user import CompanyCreate, CompanyOut, CompanyUpdate
from app.schemas.voucher_numbering import VoucherNumberingOut, VoucherNumberingUpdate, VoucherNumberingReset
from app.services.coa import seed_groups, seed_default_ledgers, seed_system_ledgers
from app.services.gst import seed_gst_ledgers

router = APIRouter()

VOUCHER_TYPE_DEFAULTS = {
    "sales": {"prefix": "INV", "label": "Sales Invoice"},
    "purchase": {"prefix": "PUR", "label": "Purchase Invoice"},
    "payment": {"prefix": "PAY", "label": "Payment"},
    "receipt": {"prefix": "RECP", "label": "Receipt"},
    "contra": {"prefix": "CONTRA", "label": "Contra"},
    "journal": {"prefix": "JRN", "label": "Journal"},
    "credit_note": {"prefix": "CRNOTE", "label": "Credit Note"},
    "debit_note": {"prefix": "DRNOTE", "label": "Debit Note"},
}


def _seed_voucher_numbering(db: Session, company_id: str) -> None:
    """Create default voucher numbering formats for a company."""
    for vtype, defaults in VOUCHER_TYPE_DEFAULTS.items():
        existing = db.query(VoucherNumbering).filter(
            VoucherNumbering.company_id == company_id,
            VoucherNumbering.voucher_type == vtype,
        ).first()
        if not existing:
            db.add(VoucherNumbering(
                company_id=company_id,
                voucher_type=vtype,
                prefix=defaults["prefix"],
                format_template="{PREFIX}-{YEAR}-{SEQ}",
                next_sequence=1,
                fy_start_month=4,
            ))
    db.flush()


@router.get("", response_model=list[CompanyOut])
def list_my_companies(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """List companies the current user belongs to."""
    if user.is_superadmin:
        rows = db.scalars(select(Company).order_by(Company.name)).all()
    else:
        rows = (
            db.query(Company)
            .join(CompanyMember, CompanyMember.company_id == Company.id)
            .filter(CompanyMember.user_id == user.id)
            .order_by(Company.name)
            .all()
        )
    return rows


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.gstin:
        existing = db.scalar(select(Company).where(Company.gstin == payload.gstin))
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A company with this GSTIN already exists",
            )
    company = Company(**payload.model_dump())
    db.add(company)
    db.flush()
    db.add(
        CompanyMember(
            company_id=company.id, user_id=user.id, role="owner"
        )
    )
    # Auto-add all superadmins as owners of this company
    superadmins = db.scalars(
        select(User).where(User.is_superadmin.is_(True), User.id != user.id)
    ).all()
    for sa in superadmins:
        db.add(CompanyMember(company_id=company.id, user_id=sa.id, role="owner"))
    db.commit()
    db.refresh(company)
    seed_groups(db, company.id)
    seed_default_ledgers(db, company.id)
    seed_gst_ledgers(db, company.id)
    seed_system_ledgers(db, company.id)
    _seed_voucher_numbering(db, company.id)
    db.commit()
    return company


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")
    _ensure_member(user, company, db)
    return company


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: str,
    payload: CompanyUpdate,
    company: Company = Depends(require_role(CompanyRole.owner)),
    db: Session = Depends(get_db),
):
    if company.id != company_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Cannot modify another company")

    data = payload.model_dump(exclude_unset=True)
    if "gstin" in data and data["gstin"] and data["gstin"] != company.gstin:
        clash = db.scalar(select(Company).where(Company.gstin == data["gstin"]))
        if clash:
            raise HTTPException(
                status.HTTP_409_CONFLICT, detail="GSTIN already in use"
            )
    for k, v in data.items():
        setattr(company, k, v)
    db.commit()
    db.refresh(company)
    return company


def _ensure_member(user: User, company: Company, db: Session) -> None:
    if user.is_superadmin:
        return
    is_member = db.scalar(
        select(CompanyMember).where(
            CompanyMember.company_id == company.id, CompanyMember.user_id == user.id
        )
    )
    if not is_member:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not a member")


LOGO_ALLOWED_TYPES = {"image/png", "image/jpeg"}
LOGO_MAX_BYTES = 2 * 1024 * 1024  # 2 MB


def _get_logo_dir(company_id: str) -> Path:
    base = Path(settings.upload_dir) / company_id
    base.mkdir(parents=True, exist_ok=True)
    return base


@router.post("/{company_id}/logo", status_code=status.HTTP_201_CREATED)
async def upload_logo(
    company_id: str,
    file: UploadFile = File(...),
    company: Company = Depends(require_role(CompanyRole.owner)),
    db: Session = Depends(get_db),
):
    """Upload a company logo (PNG/JPG, max 2 MB)."""
    if company.id != company_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Cannot modify another company")

    if file.content_type not in LOGO_ALLOWED_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Only PNG and JPG images are allowed",
        )

    content = await file.read()
    if len(content) > LOGO_MAX_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 2 MB",
        )

    ext = ".png" if file.content_type == "image/png" else ".jpg"
    stored_name = f"logo{ext}"
    logo_dir = _get_logo_dir(company_id)
    file_path = logo_dir / stored_name
    file_path.write_bytes(content)

    company.logo_filename = stored_name
    db.commit()
    return {"logo_url": f"/api/companies/{company_id}/logo"}


@router.get("/{company_id}/logo")
def get_logo(
    company_id: str,
    db: Session = Depends(get_db),
):
    """Serve the company logo image."""
    company = db.get(Company, company_id)
    if not company or not company.logo_filename:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Logo not found")

    file_path = _get_logo_dir(company_id) / company.logo_filename
    if not file_path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Logo file not found on disk")

    media_type = "image/png" if company.logo_filename.endswith(".png") else "image/jpeg"
    return FileResponse(path=file_path, media_type=media_type)


@router.delete("/{company_id}/logo", status_code=status.HTTP_204_NO_CONTENT)
def delete_logo(
    company_id: str,
    company: Company = Depends(require_role(CompanyRole.owner)),
    db: Session = Depends(get_db),
):
    """Delete the company logo."""
    if company.id != company_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Cannot modify another company")

    if company.logo_filename:
        file_path = _get_logo_dir(company_id) / company.logo_filename
        if file_path.exists():
            file_path.unlink()
        company.logo_filename = None
        db.commit()


# ─── Voucher Numbering ───────────────────────────────────────────────────


@router.get("/{company_id}/voucher-numbering", response_model=list[VoucherNumberingOut])
def list_voucher_numbering(
    company_id: str,
    company: Company = Depends(require_role(CompanyRole.owner)),
    db: Session = Depends(get_db),
):
    """List all voucher numbering formats for a company."""
    if company.id != company_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Cannot view another company")

    items = db.query(VoucherNumbering).filter(
        VoucherNumbering.company_id == company_id,
    ).order_by(VoucherNumbering.voucher_type).all()

    if not items:
        _seed_voucher_numbering(db, company_id)
        db.commit()
        items = db.query(VoucherNumbering).filter(
            VoucherNumbering.company_id == company_id,
        ).order_by(VoucherNumbering.voucher_type).all()

    return items


@router.patch("/{company_id}/voucher-numbering/{voucher_type}", response_model=VoucherNumberingOut)
def update_voucher_numbering(
    company_id: str,
    voucher_type: str,
    payload: VoucherNumberingUpdate,
    company: Company = Depends(require_role(CompanyRole.owner)),
    db: Session = Depends(get_db),
):
    """Update voucher numbering format for a specific voucher type."""
    if company.id != company_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Cannot modify another company")

    item = db.query(VoucherNumbering).filter(
        VoucherNumbering.company_id == company_id,
        VoucherNumbering.voucher_type == voucher_type,
    ).first()

    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher numbering not found for this type")

    item.prefix = payload.prefix
    item.format_template = payload.format_template
    item.fy_start_month = payload.fy_start_month
    db.commit()
    db.refresh(item)
    return item


@router.post("/{company_id}/voucher-numbering/{voucher_type}/reset", response_model=VoucherNumberingOut)
def reset_voucher_sequence(
    company_id: str,
    voucher_type: str,
    payload: VoucherNumberingReset | None = None,
    company: Company = Depends(require_role(CompanyRole.owner)),
    db: Session = Depends(get_db),
):
    """Reset the sequence counter for a voucher type."""
    if company.id != company_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Cannot modify another company")

    item = db.query(VoucherNumbering).filter(
        VoucherNumbering.company_id == company_id,
        VoucherNumbering.voucher_type == voucher_type,
    ).first()

    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher numbering not found for this type")

    item.next_sequence = payload.next_sequence if payload else 1
    db.commit()
    db.refresh(item)
    return item
