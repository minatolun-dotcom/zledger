"""Tally import endpoints: upload, preview, confirm, undo, job tracking."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user
from app.models.import_job import ImportJob
from app.models.user import Company, User
from app.schemas.tally_import import (
    ImportJobListOut,
    ImportJobOut,
    TallyImportPreview,
)
from app.services.tally_importer import execute_import, preview_import, undo_import
from app.services.tally_parser import parse_tally_xml

router = APIRouter()


@router.post("/upload", response_model=TallyImportPreview, status_code=201)
async def upload_tally_xml(
    file: UploadFile = File(...),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unable to decode file. Use UTF-8 or Latin-1.")

    tally_data = parse_tally_xml(text)
    summary = preview_import(tally_data)

    has_data = any(
        isinstance(v, list) and len(v) > 0
        for v in summary.values()
    )
    if not has_data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No valid Tally data found in file")

    job = ImportJob(
        company_id=company.id,
        user_id=user.id,
        import_type="tally",
        filename=file.filename,
        content=text,
        status="parsed",
        summary=summary,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    return TallyImportPreview(job_id=job.id, summary=summary)


@router.post("/jobs/{job_id}/confirm", response_model=ImportJobOut)
def confirm_import(
    job_id: str,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.get(ImportJob, job_id)
    if not job or job.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Import job not found")
    if job.status != "parsed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Job is in '{job.status}' state, expected 'parsed'")
    if job.import_type != "tally":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Job is not a Tally import")

    if not job.content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No XML content stored in job")

    tally_data = parse_tally_xml(job.content)

    job.status = "importing"
    db.flush()

    try:
        details = execute_import(db, company.id, user.id, tally_data, job)
        job.status = "completed"
        job.created_details = details
        job.created_counts = {
            k: len(v) for k, v in details.items()
        }
    except Exception as e:
        job.status = "failed"
        job.errors = {"error": str(e)}
        db.commit()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Import failed: {e}")

    db.commit()
    db.refresh(job)

    return _job_to_out(job)


@router.post("/jobs/{job_id}/undo", response_model=ImportJobOut)
def undo_import_job(
    job_id: str,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.get(ImportJob, job_id)
    if not job or job.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Import job not found")
    if job.status != "completed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Job is in '{job.status}' state, expected 'completed'")

    try:
        result = undo_import(db, company.id, job)
        job.status = "undone"
        job.errors = result
    except Exception as e:
        job.status = "failed"
        job.errors = {"error": str(e)}
        db.commit()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Undo failed: {e}")

    db.commit()
    db.refresh(job)

    return _job_to_out(job)


@router.get("/jobs", response_model=list[ImportJobListOut])
def list_import_jobs(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    jobs = db.query(ImportJob).filter(
        ImportJob.company_id == company.id,
    ).order_by(ImportJob.created_at.desc()).limit(50).all()

    return [
        ImportJobListOut(
            id=j.id,
            import_type=j.import_type,
            filename=j.filename,
            status=j.status,
            summary=j.summary,
            created_counts=j.created_counts,
            created_at=j.created_at.isoformat() if j.created_at else None,
        )
        for j in jobs
    ]


@router.get("/jobs/{job_id}", response_model=ImportJobOut)
def get_import_job(
    job_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    job = db.get(ImportJob, job_id)
    if not job or job.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Import job not found")
    return _job_to_out(job)


def _job_to_out(job: ImportJob) -> ImportJobOut:
    return ImportJobOut(
        id=job.id,
        company_id=job.company_id,
        user_id=job.user_id,
        import_type=job.import_type,
        filename=job.filename,
        status=job.status,
        summary=job.summary,
        errors=job.errors,
        created_counts=job.created_counts,
        created_details=job.created_details,
        total_value=float(job.total_value) if job.total_value else None,
        created_at=job.created_at.isoformat() if job.created_at else None,
        updated_at=job.updated_at.isoformat() if job.updated_at else None,
    )
