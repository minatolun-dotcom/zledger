"""Attachments endpoints: file upload, download, list, delete."""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_role
from app.models.attachment import DocumentAttachment
from app.models.user import Company, User
from app.models.voucher import Voucher
from app.schemas.attachment import AttachmentCountResponse, AttachmentOut, AttachmentUploadResponse
from app.schemas.member import CompanyRole

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".xls", ".docx", ".doc", ".csv", ".txt"}


def _get_upload_dir(company_id: str) -> Path:
    base = Path(settings.upload_dir) / company_id
    base.mkdir(parents=True, exist_ok=True)
    return base


@router.post("/upload/{voucher_id}", response_model=AttachmentUploadResponse, status_code=201)
async def upload_attachment(
    voucher_id: str,
    file: UploadFile = File(...),
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a file attachment for a voucher."""
    # Validate voucher exists and belongs to company
    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    # Validate file extension
    ext = Path(file.filename or "unknown").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{ext}' not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Validate file size
    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {settings.max_upload_size_mb}MB",
        )

    # Store file
    stored_name = uuid.uuid4().hex + ext
    upload_dir = _get_upload_dir(company.id)
    file_path = upload_dir / stored_name
    file_path.write_bytes(content)

    # Create DB record
    attachment = DocumentAttachment(
        company_id=company.id,
        voucher_id=voucher_id,
        original_filename=file.filename or "unknown",
        stored_filename=stored_name,
        mime_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        uploaded_by=user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return AttachmentUploadResponse(id=attachment.id, original_filename=attachment.original_filename)


@router.get("/{voucher_id}", response_model=list[AttachmentOut])
def list_attachments(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """List all attachments for a voucher."""
    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    attachments = (
        db.query(DocumentAttachment)
        .filter(DocumentAttachment.voucher_id == voucher_id)
        .order_by(DocumentAttachment.created_at.desc())
        .all()
    )
    return [
        AttachmentOut(
            id=a.id,
            voucher_id=a.voucher_id,
            original_filename=a.original_filename,
            mime_type=a.mime_type,
            file_size=a.file_size,
            uploaded_by=a.uploaded_by,
            created_at=a.created_at.isoformat() if a.created_at else None,
        )
        for a in attachments
    ]


@router.get("/{voucher_id}/count", response_model=AttachmentCountResponse)
def get_attachment_count(
    voucher_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get attachment count for a voucher."""
    count = (
        db.query(DocumentAttachment)
        .filter(DocumentAttachment.voucher_id == voucher_id)
        .count()
    )
    return AttachmentCountResponse(count=count)


@router.get("/{voucher_id}/download/{attachment_id}")
def download_attachment(
    voucher_id: str,
    attachment_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Download a specific attachment file."""
    voucher = db.get(Voucher, voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    attachment = db.get(DocumentAttachment, attachment_id)
    if not attachment or attachment.voucher_id != voucher_id or attachment.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    file_path = Path(settings.upload_dir) / company.id / attachment.stored_filename
    if not file_path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    return FileResponse(
        path=file_path,
        filename=attachment.original_filename,
        media_type=attachment.mime_type,
    )


@router.delete("/{attachment_id}", status_code=204)
def delete_attachment(
    attachment_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Delete an attachment and its file from disk."""
    attachment = db.get(DocumentAttachment, attachment_id)
    if not attachment or attachment.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    # Delete file from disk
    file_path = Path(settings.upload_dir) / company.id / attachment.stored_filename
    if file_path.exists():
        file_path.unlink()

    db.delete(attachment)
    db.commit()
