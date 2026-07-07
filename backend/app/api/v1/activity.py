"""Company activity endpoints: heartbeat, active users, admin activity feed."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_current_user, get_active_company
from app.models.user import Company, CompanyMember, User
from app.models.company_activity import CompanyActivity

router = APIRouter()


# ── Heartbeat ────────────────────────────────────────────────────────────

class HeartbeatRequest(BaseModel):
    current_page: str | None = None


class HeartbeatResponse(BaseModel):
    status: str
    active_users: int


@router.post("/heartbeat", response_model=HeartbeatResponse)
def send_heartbeat(
    body: HeartbeatRequest,
    request: Request,
    user: User = Depends(get_current_user),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Update the user's last-seen timestamp for the active company.

    Called every ~30 seconds by the frontend. Creates or updates the
    CompanyActivity row for this user+company.
    """
    now = datetime.now(timezone.utc)
    ip = request.client.host if request.client else None

    # Find existing activity row
    stmt = select(CompanyActivity).where(
        CompanyActivity.company_id == company.id,
        CompanyActivity.user_id == user.id,
    )
    activity = db.execute(stmt).scalar_one_or_none()

    if activity:
        activity.last_seen_at = now
        activity.current_page = body.current_page
        activity.ip_address = ip
    else:
        activity = CompanyActivity(
            company_id=company.id,
            user_id=user.id,
            last_seen_at=now,
            current_page=body.current_page,
            ip_address=ip,
        )
        db.add(activity)

    db.commit()

    # Count active users (seen in last 2 minutes)
    cutoff = now - timedelta(minutes=2)
    count_stmt = select(CompanyActivity).where(
        CompanyActivity.company_id == company.id,
        CompanyActivity.last_seen_at >= cutoff,
    )
    active_count = len(db.execute(count_stmt).scalars().all())

    return HeartbeatResponse(status="ok", active_users=active_count)


# ── Active Users ─────────────────────────────────────────────────────────

class ActiveUser(BaseModel):
    user_id: str
    name: str
    email: str
    last_seen_at: str
    current_page: str | None
    ip_address: str | None


class ActiveUsersResponse(BaseModel):
    users: list[ActiveUser]
    count: int


@router.get("/active-users", response_model=ActiveUsersResponse)
def get_active_users(
    user: User = Depends(get_current_user),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get users active in the last 2 minutes for the current company."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=2)

    stmt = (
        select(CompanyActivity, User)
        .join(User, CompanyActivity.user_id == User.id)
        .where(
            CompanyActivity.company_id == company.id,
            CompanyActivity.last_seen_at >= cutoff,
        )
        .order_by(CompanyActivity.last_seen_at.desc())
    )
    rows = db.execute(stmt).all()

    users = [
        ActiveUser(
            user_id=activity.user_id,
            name=user.name,
            email=user.email,
            last_seen_at=activity.last_seen_at.isoformat(),
            current_page=activity.current_page,
            ip_address=activity.ip_address,
        )
        for activity, user in rows
    ]

    return ActiveUsersResponse(users=users, count=len(users))


# ── Admin: Company Activity Feed ─────────────────────────────────────────

class ActivityFeedItem(BaseModel):
    user_id: str
    name: str
    email: str
    last_seen_at: str
    current_page: str | None
    ip_address: str | None


class CompanyActivityResponse(BaseModel):
    company_id: str
    company_name: str
    active_users: list[ActivityFeedItem]
    total_active: int
    recent_members: list[dict]


@router.get("/companies/{company_id}/activity", response_model=CompanyActivityResponse)
def get_company_activity(
    company_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin endpoint: get activity for a specific company.

    Superadmins can view any company. Regular users can view companies they own.
    """
    # Check permissions
    if not user.is_superadmin:
        # Check if user is owner of this company
        stmt = select(CompanyMember).where(
            CompanyMember.company_id == company_id,
            CompanyMember.user_id == user.id,
            CompanyMember.role == "owner",
        )
        if not db.execute(stmt).scalar_one_or_none():
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only owners can view company activity")

    # Get company
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")

    # Get active users (last 5 minutes for admin view)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=5)

    stmt = (
        select(CompanyActivity, User)
        .join(User, CompanyActivity.user_id == User.id)
        .where(
            CompanyActivity.company_id == company_id,
            CompanyActivity.last_seen_at >= cutoff,
        )
        .order_by(CompanyActivity.last_seen_at.desc())
    )
    rows = db.execute(stmt).all()

    active_users = [
        ActivityFeedItem(
            user_id=activity.user_id,
            name=u.name,
            email=u.email,
            last_seen_at=activity.last_seen_at.isoformat(),
            current_page=activity.current_page,
            ip_address=activity.ip_address,
        )
        for activity, u in rows
    ]

    # Get recent members
    members_stmt = (
        select(CompanyMember, User)
        .join(User, CompanyMember.user_id == User.id)
        .where(CompanyMember.company_id == company_id)
        .order_by(CompanyMember.created_at.desc())
        .limit(10)
    )
    member_rows = db.execute(members_stmt).all()
    recent_members = [
        {"user_id": m.user_id, "name": u.name, "email": u.email, "role": m.role}
        for m, u in member_rows
    ]

    return CompanyActivityResponse(
        company_id=company_id,
        company_name=company.name,
        active_users=active_users,
        total_active=len(active_users),
        recent_members=recent_members,
    )


# ── Admin: Force Logout ──────────────────────────────────────────────────

@router.post("/companies/{company_id}/force-logout")
def force_logout_company(
    company_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin endpoint: remove all activity records for a company.

    This effectively "logs out" all users on their next heartbeat
    (they'll get a 403 since the activity row is gone).
    """
    if not user.is_superadmin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only superadmins can force logout")

    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")

    # Delete all activity for this company
    stmt = delete(CompanyActivity).where(CompanyActivity.company_id == company_id)
    db.execute(stmt)
    db.commit()

    return {"status": "ok", "message": f"All sessions for {company.name} have been terminated"}
