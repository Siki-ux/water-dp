"""add_sensor_activity_configs

Revision ID: cd8e54781c5d
Revises: d89d8f0ea294
Create Date: 2026-03-22 00:00:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "cd8e54781c5d"
down_revision = "d89d8f0ea294"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sensor_activity_configs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("thing_uuid", sa.UUID(), nullable=False),
        sa.Column(
            "project_id",
            sa.UUID(),
            sa.ForeignKey("water_dp.projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "track_activity", sa.Boolean(), nullable=False, server_default="true"
        ),
        sa.Column(
            "inactivity_threshold_hours",
            sa.Integer(),
            nullable=False,
            server_default="24",
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("created_by", sa.String(length=100), nullable=True),
        sa.Column("updated_by", sa.String(length=100), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("thing_uuid"),
        schema="water_dp",
    )
    op.create_index(
        "ix_sensor_activity_configs_id",
        "sensor_activity_configs",
        ["id"],
        unique=False,
        schema="water_dp",
    )
    op.create_index(
        "ix_sensor_activity_configs_thing_uuid",
        "sensor_activity_configs",
        ["thing_uuid"],
        unique=True,
        schema="water_dp",
    )
    op.create_index(
        "ix_sensor_activity_configs_project_id",
        "sensor_activity_configs",
        ["project_id"],
        unique=False,
        schema="water_dp",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_sensor_activity_configs_project_id",
        table_name="sensor_activity_configs",
        schema="water_dp",
    )
    op.drop_index(
        "ix_sensor_activity_configs_thing_uuid",
        table_name="sensor_activity_configs",
        schema="water_dp",
    )
    op.drop_index(
        "ix_sensor_activity_configs_id",
        table_name="sensor_activity_configs",
        schema="water_dp",
    )
    op.drop_table("sensor_activity_configs", schema="water_dp")
