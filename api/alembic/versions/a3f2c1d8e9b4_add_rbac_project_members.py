"""add_rbac_project_members

Adds RBAC support:
- Index on project_members.user_id for efficient per-user project lookups
- Backfill project_members with 'owner' rows from existing projects
- Add authorization_provider_group_name column to projects for JWT group matching

Revision ID: a3f2c1d8e9b4
Revises: cd8e54781c5d
Create Date: 2026-03-23 00:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "a3f2c1d8e9b4"
down_revision = "cd8e54781c5d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure pgcrypto is available for gen_random_uuid()
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # 1. Add authorization_provider_group_name to projects
    op.add_column(
        "projects",
        sa.Column(
            "authorization_provider_group_name",
            sa.String(length=255),
            nullable=True,
        ),
        schema="water_dp",
    )
    op.create_index(
        "ix_projects_auth_group_name",
        "projects",
        ["authorization_provider_group_name"],
        schema="water_dp",
    )

    # 2. Add user_id index to project_members for efficient per-user queries
    op.create_index(
        "ix_project_members_user_id",
        "project_members",
        ["user_id"],
        schema="water_dp",
    )

    # 3. Backfill project_members: insert 'owner' rows for all existing projects
    #    Uses ON CONFLICT DO NOTHING to be safe on re-runs
    op.execute(
        """
        INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            p.id,
            p.owner_id,
            'owner',
            NOW(),
            NOW()
        FROM water_dp.projects p
        WHERE p.owner_id IS NOT NULL
        ON CONFLICT (project_id, user_id) DO NOTHING
        """
    )


def downgrade() -> None:
    # Remove backfilled owner rows (only those without updated_at changed,
    # i.e., ones created by this migration — identified by role='owner')
    # NOTE: This is a best-effort downgrade; manually-added owner rows
    # created after migration will also be removed.
    op.execute(
        """
        DELETE FROM project_members
        WHERE role = 'owner'
          AND user_id IN (SELECT owner_id FROM water_dp.projects)
        """
    )

    op.drop_index("ix_project_members_user_id", table_name="project_members", schema="water_dp")

    op.drop_index(
        "ix_projects_auth_group_name",
        table_name="projects",
        schema="water_dp",
    )
    op.drop_column("projects", "authorization_provider_group_name", schema="water_dp")
