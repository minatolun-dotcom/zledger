"""Currency and ExchangeRate endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company
from app.models.currency import SUPPORTED_CURRENCIES, ExchangeRate
from app.models.user import Company
from app.schemas.currency import ExchangeRateCreate, ExchangeRateOut, ExchangeRateUpdate, SupportedCurrencyOut

router = APIRouter()


@router.get("/currencies", response_model=list[SupportedCurrencyOut])
def list_supported_currencies():
    return [{"code": k, "symbol": v} for k, v in SUPPORTED_CURRENCIES.items()]


@router.get("/exchange-rates", response_model=list[ExchangeRateOut])
def list_exchange_rates(
    currency: str | None = None,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    q = db.query(ExchangeRate).filter(ExchangeRate.company_id == company.id)
    if currency:
        q = q.filter(ExchangeRate.currency == currency)
    return q.order_by(ExchangeRate.currency, ExchangeRate.rate_date.desc()).all()


@router.post("/exchange-rates", response_model=ExchangeRateOut, status_code=201)
def create_exchange_rate(
    payload: ExchangeRateCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    existing = db.query(ExchangeRate).filter(
        ExchangeRate.company_id == company.id,
        ExchangeRate.currency == payload.currency,
        ExchangeRate.rate_date == payload.rate_date,
    ).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Exchange rate already exists for this currency/date")
    er = ExchangeRate(company_id=company.id, **payload.model_dump())
    db.add(er)
    db.commit()
    db.refresh(er)
    return er


@router.patch("/exchange-rates/{rate_id}", response_model=ExchangeRateOut)
def update_exchange_rate(
    rate_id: str,
    payload: ExchangeRateUpdate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    er = db.get(ExchangeRate, rate_id)
    if not er or er.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Exchange rate not found")
    er.rate = payload.rate
    db.commit()
    db.refresh(er)
    return er


@router.delete("/exchange-rates/{rate_id}", status_code=204)
def delete_exchange_rate(
    rate_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    er = db.get(ExchangeRate, rate_id)
    if not er or er.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Exchange rate not found")
    db.delete(er)
    db.commit()
