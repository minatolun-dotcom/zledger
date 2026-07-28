"""Tally import endpoints: upload, preview, confirm, undo, job tracking."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_module
from app.models.import_job import ImportJob
from app.models.user import Company, User
from app.schemas.tally_import import (
    ImportJobListOut,
    ImportJobOut,
    TallyImportPreview,
)
from app.services.tally_importer import execute_import, preview_import, undo_import, validate_import
from app.services.tally_parser import parse_tally_xml, parse_tally_excel, tally_data_from_json
from app.services.tally_archive import parse_tally_archive, _decode_bytes
from app.services.tally_sample import generate_sample_xml, generate_sample_excel
from app.services.notification import notify
from scripts.seed_demo_data import create_company, create_fy

router = APIRouter()


@router.post("/upload", response_model=TallyImportPreview, status_code=201,
             dependencies=[Depends(require_module("import_export"))])
async def upload_tally_xml(
    file: UploadFile = File(...),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()

    is_excel = file.filename and file.filename.lower().endswith(".xlsx")

    if is_excel:
        tally_data = parse_tally_excel(content)
        raw_content = content
    else:
        text = _decode_bytes(content)  # handles Tally's UTF-16 + latin-1/utf-8
        tally_data = parse_tally_xml(text)
        raw_content = text.encode("utf-8")

    summary = preview_import(tally_data)

    has_data = any(
        isinstance(v, list) and len(v) > 0
        for v in summary.values()
    )
    if not has_data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No valid data found in file")

    # Validate references
    validation = validate_import(db, company.id, tally_data)

    job = ImportJob(
        company_id=company.id,
        user_id=user.id,
        import_type="tally",
        filename=file.filename,
        content=raw_content,
        status="parsed",
        summary=summary,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    return TallyImportPreview(job_id=job.id, summary=summary, validation=validation)


@router.post("/upload-archive", response_model=TallyImportPreview, status_code=201,
             dependencies=[Depends(require_module("import_export"))])
async def upload_tally_archive(
    file: UploadFile = File(...),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()

    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Upload a .zip archive of Tally XML/Excel exports or a raw Tally company folder.")

    try:
        tally_data = parse_tally_archive(content)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Could not parse archive: {e}")

    summary = preview_import(tally_data)

    has_data = any(
        isinstance(v, list) and len(v) > 0
        for v in summary.values()
    )
    if not has_data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No valid data found in archive")

    validation = validate_import(db, company.id, tally_data)

    job = ImportJob(
        company_id=company.id,
        user_id=user.id,
        import_type="tally",
        filename=file.filename,
        content=content,
        status="parsed",
        summary=summary,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    return TallyImportPreview(job_id=job.id, summary=summary, validation=validation)


@router.post("/upload-multiple", response_model=TallyImportPreview, status_code=201,
             dependencies=[Depends(require_module("import_export"))])
async def upload_tally_multiple(
    files: list[UploadFile] = File(...),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload multiple Tally XML/Excel files and merge into one import job."""
    if not files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No files provided")

    from app.services.tally_archive import parse_tally_archive
    from app.services.tally_parser import parse_tally_xml, parse_tally_excel, tally_data_to_json

    merged: TallyData | None = None
    raw_parts: list[bytes] = []
    filenames: list[str] = []

    for f in files:
        content = await f.read()
        filenames.append(f.filename or "unknown")
        is_excel = f.filename and f.filename.lower().endswith(".xlsx")
        if is_excel:
            data = parse_tally_excel(content)
            raw_parts.append(content)
        else:
            text = _decode_bytes(content)
            data = parse_tally_xml(text)
            raw_parts.append(text.encode("utf-8"))

        if merged is None:
            merged = data
        else:
            _merge_into(merged, data)

    if merged is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No valid data found")

    summary = preview_import(merged)
    has_data = any(isinstance(v, list) and len(v) > 0 for v in summary.values())
    if not has_data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No valid data found in files")

    validation = validate_import(db, company.id, merged)

    data_json = tally_data_to_json(merged)
    content_bytes = json.dumps(data_json).encode("utf-8")
    job_label = ", ".join(filenames)

    job = ImportJob(
        company_id=company.id,
        user_id=user.id,
        import_type="tally",
        filename=job_label,
        content=content_bytes,
        status="parsed",
        summary=summary,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    return TallyImportPreview(job_id=job.id, summary=summary, validation=validation)


@router.post("/jobs/{job_id}/confirm", response_model=ImportJobOut,
             dependencies=[Depends(require_module("import_export"))])
def confirm_import(
    job_id: str,
    new_company_name: str | None = Query(None, description="If set, import into a NEW company with this name instead of the active company."),
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
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No content stored in job")

    fname = (job.filename or "").lower()
    if fname.endswith(".zip"):
        try:
            tally_data = parse_tally_archive(job.content)
        except Exception as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Could not parse archive: {e}")
    elif fname.endswith(".xlsx"):
        tally_data = parse_tally_excel(job.content)
    elif fname.endswith(".tallydata"):
        try:
            data_dict = json.loads(job.content.decode("utf-8"))
            tally_data = tally_data_from_json(data_dict)
        except Exception as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Could not parse stored data: {e}")
    elif job.content[:1] == b"{":
        # JSON-serialized TallyData (from upload-multiple or from-folder)
        try:
            data_dict = json.loads(job.content.decode("utf-8"))
            tally_data = tally_data_from_json(data_dict)
        except Exception as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Could not parse stored data: {e}")
    else:
        text = job.content.decode("utf-8")
        tally_data = parse_tally_xml(text)

    target_company_id = company.id
    target_company_name = company.name
    if new_company_name:
        new_co = create_company(db, user.id, name=new_company_name)
        create_fy(db, new_co.id, "2024-2025", "2024-04-01", "2025-03-31", False)
        db.flush()
        target_company_id = new_co.id
        target_company_name = new_co.name

    job.status = "importing"
    db.flush()

    try:
        details, skip_log, logs = execute_import(db, target_company_id, user.id, tally_data, job)
        job.status = "completed"
        job.created_details = details
        job.created_counts = {
            k: len(v) for k, v in details.items()
        }
        if new_company_name:
            if not job.logs:
                job.logs = []
            from app.services.tally_importer import log_detail
            log_detail(job.logs, "company", f"Imported into new company '{target_company_name}'", status="info")
        if skip_log:
            job.errors = {"skip_warnings": skip_log}
        job.logs = logs
    except Exception as e:
        job.status = "failed"
        job.errors = {"error": str(e)}
        if logs:
            from app.services.tally_importer import log_detail
            log_detail(logs, "error", f"Import failed: {e}", status="error")
            job.logs = logs
        db.commit()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Import failed: {e}")

    db.commit()
    db.refresh(job)

    total_created = sum(job.created_counts.values()) if job.created_counts else 0
    notify(
        db, company.id,
        title="Tally Import Completed",
        message=f"Imported {total_created} records from {job.filename}" + (f" ({len(skip_log)} warnings)" if skip_log else "") + (f" into new company '{target_company_name}'" if new_company_name else ""),
        category="success",
        link="/tally-import",
        user_id=user.id,
        entity_type="import_job",
        entity_id=job.id,
    )
    db.commit()

    return _job_to_out(job)


@router.post("/jobs/{job_id}/undo", response_model=ImportJobOut,
             dependencies=[Depends(require_module("import_export"))])
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


@router.get("/jobs", response_model=list[ImportJobListOut],
           dependencies=[Depends(require_module("import_export"))])
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


@router.get("/jobs/{job_id}", response_model=ImportJobOut,
           dependencies=[Depends(require_module("import_export"))])
def get_import_job(
    job_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    job = db.get(ImportJob, job_id)
    if not job or job.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Import job not found")
    return _job_to_out(job)


@router.get("/sample")
def download_sample(
    format: str = Query("xml", description="File format: xml or xlsx"),
):
    if format == "xlsx":
        data = generate_sample_excel()
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=tally_import_sample.xlsx"},
        )
    else:
        data = generate_sample_xml()
        return Response(
            content=data,
            media_type="text/plain",
            headers={"Content-Disposition": "attachment; filename=tally_import_sample.xml"},
        )


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
        logs=job.logs,
        created_at=job.created_at.isoformat() if job.created_at else None,
        updated_at=job.updated_at.isoformat() if job.updated_at else None,
    )

# ── Tally folder scanning & import from local directory ─────────────────────

import json
import os as _os

SCAN_ROOT = "/app/tally-data"


def _has_binary_data(path: str) -> bool:
    """Check if a directory contains .1800/.200 files anywhere in its tree (recursive)."""
    for entry in _os.listdir(path):
        p = _os.path.join(path, entry)
        if _os.path.isfile(p) and (entry.endswith(".1800") or entry.endswith(".200") or entry.endswith(".idx")):
            return True
        if _os.path.isdir(p):
            if _has_binary_data(p):
                return True
    return False


def _is_company_root(path: str) -> bool:
    """Check if a directory looks like a Tally company root.

    A company root either:
    - Has .1800/.200 files directly inside it, OR
    - Has a descendant directory (up to 2 levels deep) that contains .1800 files

    This is shallower than _has_binary_data (which recurses fully) to avoid
    treating the parent of all company folders as a company itself.
    """
    # Level 0: direct files
    for entry in _os.listdir(path):
        if entry.endswith((".1800", ".200", ".idx")):
            return True
    # Level 1: immediate child directories
    for entry in _os.listdir(path):
        p = _os.path.join(path, entry)
        if not _os.path.isdir(p):
            continue
        for child in _os.listdir(p):
            if child.endswith((".1800", ".200", ".idx")):
                return True
    # Level 2: grandchildren (handles EBCC's Data/010000/*.1800)
    for entry in _os.listdir(path):
        p = _os.path.join(path, entry)
        if not _os.path.isdir(p):
            continue
        for child in _os.listdir(p):
            cp = _os.path.join(p, child)
            if not _os.path.isdir(cp):
                continue
            for grandchild in _os.listdir(cp):
                if grandchild.endswith((".1800", ".200", ".idx")):
                    return True
    return False


def _find_matching_xml(company_folder: str, xml_dir: str | None = None) -> list[str]:
    """Find XML files in xml/ that match the company folder name (fuzzy)."""
    if xml_dir is None:
        xml_dir = _os.path.join(SCAN_ROOT, "xml")
    if not _os.path.isdir(xml_dir):
        return []
    # Normalize: strip spaces, lowercase for matching
    norm_name = company_folder.replace(" ", "").replace("&", "").replace("-", "").lower()
    matches = []
    for fname in _os.listdir(xml_dir):
        if not fname.lower().endswith(".xml"):
            continue
        norm_fname = fname.replace(" ", "").replace("&", "").replace("-", "").lower()
        if norm_name in norm_fname:
            matches.append(fname)
    return sorted(matches)


def _find_data_dirs(root: str) -> list[str]:
    """Recursively find all directories that directly contain .1800/.200/.idx files.

    This handles both standard structures (period/100000/Manager.1800)
    and nested ones (Data/010000/Manager.1800, Data/010000/010000/Manager.1800).
    Returns relative paths from root.
    """
    result: list[str] = []
    for entry in sorted(_os.listdir(root)):
        full = _os.path.join(root, entry)
        if not _os.path.isdir(full):
            continue
        # If this directory directly contains .1800 files, it's a data dir
        has_direct = any(f.endswith((".1800", ".200", ".idx")) for f in _os.listdir(full))
        if has_direct and not entry.startswith("."):
            result.append(entry)
        else:
            # Recurse deeper — the data dir might be nested (e.g. Data/010000/)
            deeper = [_os.path.join(entry, d) for d in _find_data_dirs(full)]
            result.extend(deeper)
    return result


@router.get("/browse",
            dependencies=[Depends(require_module("import_export"))])
def browse_tally_folder(
    path: str = Query("",
        description="Relative path under /app/tally-data/ to browse. Empty shows the root."),
    user: User = Depends(get_current_user),
):
    """List subdirectories under a given path, marking which are Tally companies.

    Returns a directory listing suitable for a folder-tree browser. Each entry
    includes whether it's a company (has .1800 data) and whether it has further
    subdirectories.
    """
    browse_root = SCAN_ROOT
    if path:
        browse_root = _os.path.join(SCAN_ROOT, path)
        if not _os.path.isdir(browse_root):
            return {"entries": [], "error": f"Path not found: {browse_root}"}

    entries: list[dict] = []
    for name in sorted(_os.listdir(browse_root)):
        if name.startswith(".") or name == "xml":
            continue
        full = _os.path.join(browse_root, name)
        if not _os.path.isdir(full):
            continue
        is_company = _is_company_root(full)
        has_subdirs = any(
            _os.path.isdir(_os.path.join(full, e)) and not e.startswith(".")
            for e in _os.listdir(full)
        )
        entries.append({
            "name": name,
            "is_company": is_company,
            "has_subdirs": has_subdirs,
            "path": (_os.path.join(path, name) if path else name),
        })

    return {"entries": entries, "current_path": path or "/"}


@router.get("/scan-companies",
            dependencies=[Depends(require_module("import_export"))])
def scan_companies(
    path: str = Query("",
        description="Subdirectory under /app/tally-data/ to scan. Empty = scan the whole directory."),
    user: User = Depends(get_current_user),
):
    """Scan a directory for Tally company folders with .1800 data.

    The path is relative to /app/tally-data/ (the mounted tally/Tally Data/ folder).
    Leave empty to scan the entire directory for all companies.
    """
    scan_path = SCAN_ROOT
    if path:
        scan_path = _os.path.join(SCAN_ROOT, path)
        if not _os.path.isdir(scan_path):
            return {"companies": [], "error": f"Path not found: {scan_path}. Must be a subfolder of /app/tally-data/."}

    if not _os.path.isdir(scan_path):
        return {"companies": []}

    companies: list[dict] = []
    xml_dir = _os.path.join(SCAN_ROOT, "xml")

    # Strategy:
    # 1. If an explicit path is given and it points to a company, show it as one company.
    # 2. If scanning the root (no path), list each child that has data as a company.
    company_names: list[str] = []

    if path:
        if _is_company_root(scan_path):
            company_names.append(_os.path.basename(scan_path))
            base_dir = _os.path.dirname(scan_path)
        else:
            # Path isn't a company itself — scan its children
            base_dir = scan_path
            for entry in sorted(_os.listdir(scan_path)):
                if entry == "xml" or entry.startswith("."):
                    continue
                fp = _os.path.join(scan_path, entry)
                if _os.path.isdir(fp) and _is_company_root(fp):
                    company_names.append(entry)
    else:
        base_dir = scan_path
        for entry in sorted(_os.listdir(scan_path)):
            if entry == "xml" or entry.startswith("."):
                continue
            fp = _os.path.join(scan_path, entry)
            if _os.path.isdir(fp) and _is_company_root(fp):
                company_names.append(entry)

    if not company_names:
        return {"companies": []}

    for name in company_names:
        full_path = _os.path.join(base_dir, name)
        if not _os.path.isdir(full_path):
            continue

        # Use recursive data-dir detection to find ALL periods.
        # We don't filter out sub-companies in scan view — the user needs
        # to see the actual data structure. Period filtering only happens
        # during import (import_from_folder).
        all_data_dirs = _find_data_dirs(full_path)

        periods: list[dict] = []
        for dd in all_data_dirs:
            pp = _os.path.join(full_path, dd)
            if not _os.path.isdir(pp):
                continue
            count = sum(1 for f in _os.listdir(pp) if f.endswith((".1800", ".200", ".idx")))
            if count == 0:
                continue
            total_size = 0
            for dirpath, _dirs, files in _os.walk(pp):
                for f in files:
                    try:
                        total_size += _os.path.getsize(_os.path.join(dirpath, f))
                    except OSError:
                        pass
            periods.append({
                "folder": f"{name}/{dd}",
                "file_count": count,
                "size_bytes": total_size,
            })

        xml_matches = _find_matching_xml(name, xml_dir)

        companies.append({
            "folder_name": name,
            "periods": periods,
            "has_xml_masters": any("ALLMASTER" in x or "ALL MASTER" in x for x in xml_matches),
            "has_xml_vouchers": any("ALLVOUCHER" in x for x in xml_matches),
            "xml_files": xml_matches,
        })

    return {"companies": companies, "scanned_path": scan_path}


@router.post("/from-folder", response_model=TallyImportPreview, status_code=201,
             dependencies=[Depends(require_module("import_export"))])
def import_from_folder(
    folder_name: str = Query("",
        description="Folder name under /app/tally-data/ (e.g. 'Hornbill Cable Network'). Ignored if path is set."),
    path: str | None = Query(None,
        description="Absolute path inside the container to scan. Overrides folder_name."),
    company_name: str | None = Query(None,
        description="Override company name (defaults to folder name)"),
    period: str | None = Query(None,
        description="Specific period folder to import (e.g. '100001'). Empty means all periods."),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parse a Tally company folder (binary .1800 + optional XML) and create an import job.

    The folder must be present under /app/tally-data/ (typically /tally-data).
    Binary files are parsed via read_tally_company(), and matching XML files
    from the xml/ subdirectory are also ingested.
    """
    from app.services.tally_binary import read_tally_company
    from app.services.tally_parser import parse_tally_xml, tally_data_to_json
    from app.services.tally_archive import _decode_bytes

    # Determine the folder path: explicit path takes priority, else relative to SCAN_ROOT
    if path:
        folder_path = path
        company_label = company_name or _os.path.basename(path.rstrip("/" + _os.sep))
    else:
        folder_path = _os.path.join(SCAN_ROOT, folder_name)
        company_label = company_name or folder_name
    if not _os.path.isdir(folder_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail=f"Folder not found: {folder_path}")
    tally_data_tmp = None

    # Step 1: parse binary .1800 files from each period subfolder
    if period:
        period_dirs = [period]
    else:
        # Use recursive data-dir detection to find all valid period directories.
        # Filter out paths that pass through sub-company directories (e.g.
        # IDEAL ENTERPRISE/INH Feb 2026/100000/ where INH Feb 2026 is itself
        # a company, not a period of IDEAL ENTERPRISE).
        all_data_dirs = _find_data_dirs(folder_path)
        period_dirs = []
        sub_company_set: set[str] = set()

        # A non-digit child is a sub-company only if the PARENT folder
        # already has its own period data (a digit-named dir at level 1
        # with .1800 files). If the parent has NO own periods, then
        # non-digit children are grouping folders (e.g. EBCC's Data/).
        parent_has_own_periods = any(
            entry.isdigit() and any(
                f.endswith((".1800", ".200", ".idx"))
                for f in _os.listdir(_os.path.join(folder_path, entry))
            )
            for entry in _os.listdir(folder_path)
            if _os.path.isdir(_os.path.join(folder_path, entry))
        )

        if parent_has_own_periods:
            # This folder has its own period data, so non-digit children
            # with data dirs are sub-companies to exclude
            for child in sorted(_os.listdir(folder_path)):
                child_path = _os.path.join(folder_path, child)
                if _os.path.isdir(child_path) and not child.isdigit():
                    child_dirs = _find_data_dirs(child_path)
                    if child_dirs:
                        sub_company_set.add(child)

        for dd in all_data_dirs:
            # dd is a path relative to folder_path, e.g. "100000" or "Data/010000" or "INH Feb 2026/100000"
            parts = dd.split(_os.sep)
            # If the first part is in the sub-company set, skip this data dir
            if parts and parts[0] in sub_company_set:
                continue
            # If the full relative path directory exists, include it
            pp = _os.path.join(folder_path, dd)
            if _os.path.isdir(pp):
                period_dirs.append(dd)

    for pd in period_dirs:
        pp = _os.path.join(folder_path, pd)
        if not _os.path.isdir(pp):
            continue
        try:
            data = read_tally_company(pp)
            if tally_data_tmp is None:
                tally_data_tmp = data
            else:
                _merge_into(tally_data_tmp, data)
        except Exception as e:
            # Log and continue — partial data is better than none
            print(f"Warning: failed to parse binary data in {pd}: {e}")

    # Step 2: parse matching XML files
    xml_dir = _os.path.join(SCAN_ROOT, "xml")
    xml_matches = _find_matching_xml(company_label, xml_dir)
    for xml_name in xml_matches:
        xml_path = _os.path.join(xml_dir, xml_name)
        try:
            raw = open(xml_path, "rb").read()
            text = _decode_bytes(raw)
            xml_data = parse_tally_xml(text)
            if tally_data_tmp is None:
                tally_data_tmp = xml_data
            else:
                _merge_into(tally_data_tmp, xml_data)
        except Exception as e:
            print(f"Warning: failed to parse XML {xml_name}: {e}")

    if tally_data_tmp is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"No parseable data found in {folder_name}")

    # Step 3: create ImportJob with JSON-serialized TallyData
    data_json = tally_data_to_json(tally_data_tmp)
    content_bytes = json.dumps(data_json).encode("utf-8")

    summary = preview_import(tally_data_tmp)
    has_data = any(
        isinstance(v, list) and len(v) > 0
        for v in summary.values()
    )
    if not has_data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="No valid data found in folder")

    validation = validate_import(db, company.id, tally_data_tmp)

    job = ImportJob(
        company_id=company.id,
        user_id=user.id,
        import_type="tally",
        filename=f"{company_label}.tallydata",
        content=content_bytes,
        status="parsed",
        summary=summary,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    return TallyImportPreview(job_id=job.id, summary=summary, validation=validation)


def _merge_into(target, src):
    """Merge src TallyData into target TallyData (inline duplicate check)."""
    existing_groups = {g.name for g in target.groups}
    existing_ledgers = {l.name for l in target.ledgers}
    existing_parties = {p.name for p in target.parties}
    existing_sg = {s.name for s in target.stock_groups}
    existing_si = {s.name for s in target.stock_items}
    existing_vch = {(v.voucher_type, v.voucher_number) for v in target.vouchers}

    for g in src.groups:
        if g.name not in existing_groups:
            target.groups.append(g)
            existing_groups.add(g.name)
    for l in src.ledgers:
        if l.name not in existing_ledgers:
            target.ledgers.append(l)
            existing_ledgers.add(l.name)
    for p in src.parties:
        if p.name not in existing_parties:
            target.parties.append(p)
            existing_parties.add(p.name)
    for s in src.stock_groups:
        if s.name not in existing_sg:
            target.stock_groups.append(s)
            existing_sg.add(s.name)
    for s in src.stock_items:
        if s.name not in existing_si:
            target.stock_items.append(s)
            existing_si.add(s.name)
    for v in src.vouchers:
        key = (v.voucher_type, v.voucher_number)
        if key not in existing_vch:
            target.vouchers.append(v)
            existing_vch.add(key)
