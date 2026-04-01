"""add_alert_sensor_datastream_columns

Revision ID: b5f3d2e7a1c9
Revises: a3f2c1d8e9b4
Create Date: 2026-04-01 00:00:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "b5f3d2e7a1c9"
down_revision = "a3f2c1d8e9b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "alert_definitions",
        sa.Column("sensor_id", sa.String(), nullable=True),
        schema="water_dp",
    )
    op.add_column(
        "alert_definitions",
        sa.Column("datastream_id", sa.String(), nullable=True),
        schema="water_dp",
    )


def downgrade() -> None:
    op.drop_column("alert_definitions", "datastream_id", schema="water_dp")
    op.drop_column("alert_definitions", "sensor_id", schema="water_dp")
