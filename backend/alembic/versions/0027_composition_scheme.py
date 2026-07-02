"""Add composition scheme support: registration_type, composition_rate on gst_registrations; is_composition on companies

Revision ID: 0027
Revises: 0026
Create Date: 2026-07-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # GstRegistration: add registration_type and composition_rate
    op.add_column(
        "gst_registrations",
        sa.Column("registration_type", sa.String(20), nullable=False, server_default="regular"),
    )
    op.add_column(
        "gst_registrations",
        sa.Column("composition_rate", sa.Numeric(5, 2), nullable=True),
    )
    # Company: add is_composition flag
    op.add_column(
        "companies",
        sa.Column("is_composition", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("companies", "is_composition")
    op.drop_column("gst_registrations", "composition_rate")
    op.drop_column("gst_registrations", "registration_type")
