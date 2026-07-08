"""Add logs column to import_jobs table."""
from alembic import op
import sqlalchemy as sa

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("import_jobs", sa.Column("logs", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("import_jobs", "logs")
