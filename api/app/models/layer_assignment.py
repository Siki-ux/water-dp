"""
Layer-Project assignment model for associating GeoServer layers with projects.
"""

from sqlalchemy import Column, DateTime, Index, Integer, String, func

from app.core.database import Base


class LayerProjectAssignment(Base):
    """Many-to-many association between geo layers and projects."""

    __tablename__ = "layer_project_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    layer_name = Column(
        String(100),
        nullable=False,
    )
    project_id = Column(String(255), nullable=False)  # Project UUID / schema name
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_lpa_layer", "layer_name"),
        Index("idx_lpa_project", "project_id"),
        Index("uq_lpa_layer_project", "layer_name", "project_id", unique=True),
    )
