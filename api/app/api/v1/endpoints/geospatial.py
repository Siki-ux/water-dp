"""
Geospatial API endpoints.
"""

import json
import logging
import uuid as uuid_module
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, has_role
from app.core.config import settings
from app.core.database import get_db
from app.schemas.geospatial import (
    FeatureListResponse,
    GeoFeatureCreate,
    GeoFeatureResponse,
    GeoFeatureUpdate,
    GeoLayerCreate,
    GeoLayerResponse,
    GeoLayerUpdate,
    LayerListResponse,
    LayerPublishRequest,
    LayerUnpublishRequest,
    SpatialQuery,
    SpatialQueryResponse,
)
from app.services.database_service import DatabaseService
from app.services.geoserver_service import GeoServerService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/layers",
    response_model=GeoLayerResponse,
    status_code=201,
    dependencies=[Depends(has_role("admin"))],
)
async def create_geo_layer(layer: GeoLayerCreate, database: Session = Depends(get_db)):
    """Create a new geospatial layer."""
    db_service = DatabaseService(database)
    return db_service.create_geo_layer(layer)


@router.get("/layers", response_model=LayerListResponse)
async def get_geo_layers(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records"),
    workspace: Optional[str] = Query(None, description="Filter by workspace"),
    layer_type: Optional[str] = Query(None, description="Filter by layer type"),
    is_published: Optional[bool] = Query(
        None, description="Filter by publication status"
    ),
    is_public: Optional[bool] = Query(None, description="Filter by public access"),
    database: Session = Depends(get_db),
):
    """Get geospatial layers — merges DB-seeded layers with GeoServer."""
    from app.models.geospatial import GeoLayer as GeoLayerModel

    try:
        # 1. Query DB for seeded / user-created layers
        q = database.query(GeoLayerModel)
        if workspace:
            q = q.filter(GeoLayerModel.workspace == workspace)
        if layer_type:
            q = q.filter(GeoLayerModel.layer_type == layer_type)
        if is_published is not None:
            q = q.filter(
                GeoLayerModel.is_published == ("true" if is_published else "false")
            )
        if is_public is not None:
            q = q.filter(GeoLayerModel.is_public == ("true" if is_public else "false"))

        db_layers = q.all()
        seen_names = set()
        mapped_layers = []

        for layer in db_layers:
            seen_names.add(layer.layer_name)
            mapped_layers.append(
                {
                    "id": layer.id,
                    "layer_name": layer.layer_name,
                    "title": layer.title,
                    "description": layer.description,
                    "workspace": layer.workspace,
                    "store_name": layer.store_name,
                    "srs": layer.srs,
                    "layer_type": layer.layer_type,
                    "geometry_type": layer.geometry_type,
                    "is_published": layer.is_published == "true",
                    "is_public": layer.is_public == "true",
                    "created_at": layer.created_at,
                    "updated_at": layer.updated_at,
                }
            )

        # 2. Also fetch from GeoServer (merge in any that aren't already in DB)
        try:
            geoserver_service = GeoServerService()
            target_workspace = workspace or settings.geoserver_workspace or "water_data"
            gs_layers = geoserver_service.get_layers(target_workspace)

            for index, gs_layer in enumerate(gs_layers):
                if gs_layer.name not in seen_names:
                    seen_names.add(gs_layer.name)
                    mapped_layers.append(
                        {
                            "id": 10000 + index,
                            "layer_name": gs_layer.name,
                            "title": gs_layer.title,
                            "description": gs_layer.abstract,
                            "workspace": gs_layer.workspace,
                            "store_name": gs_layer.store,
                            "srs": gs_layer.srs,
                            "layer_type": "vector",
                            "geometry_type": "polygon",
                            "is_published": True,
                            "is_public": True,
                            "created_at": datetime.utcnow(),
                            "updated_at": datetime.utcnow(),
                        }
                    )
        except Exception as gs_err:
            logger.warning(
                f"GeoServer not reachable, returning DB layers only: {gs_err}"
            )

        # 3. Paginate
        total = len(mapped_layers)
        paged = mapped_layers[skip : skip + limit]

        return LayerListResponse(layers=paged, total=total, skip=skip, limit=limit)

    except Exception as error:
        import traceback

        traceback.print_exc()
        logger.error(f"Failed to fetch layers: {error}")
        raise HTTPException(status_code=500, detail=f"Error: {str(error)}")


@router.get("/layers/{layer_name}", response_model=GeoLayerResponse)
async def get_geo_layer(layer_name: str, database: Session = Depends(get_db)):
    """Get a specific geospatial layer."""
    db_service = DatabaseService(database)
    return db_service.get_geo_layer(layer_name)


@router.put(
    "/layers/{layer_name}",
    response_model=GeoLayerResponse,
    dependencies=[Depends(has_role("admin"))],
)
async def update_geo_layer(
    layer_name: str, layer_update: GeoLayerUpdate, database: Session = Depends(get_db)
):
    """Update a geospatial layer."""
    db_service = DatabaseService(database)
    return db_service.update_geo_layer(layer_name, layer_update)


@router.delete(
    "/layers/{layer_name}", status_code=204, dependencies=[Depends(has_role("admin"))]
)
async def delete_geo_layer(layer_name: str, database: Session = Depends(get_db)):
    """Delete a geospatial layer."""
    db_service = DatabaseService(database)
    db_service.delete_geo_layer(layer_name)


@router.post("/features", response_model=GeoFeatureResponse, status_code=201)
async def create_geo_feature(
    feature: GeoFeatureCreate,
    database: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a new geospatial feature."""
    db_service = DatabaseService(database)
    return db_service.create_geo_feature(feature)


@router.get("/features", response_model=FeatureListResponse)
async def get_geo_features(
    layer_name: str = Query(..., description="Layer name"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum number of records"),
    feature_type: Optional[str] = Query(None, description="Filter by feature type"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    bbox: Optional[str] = Query(
        None, description="Bounding box (min_lon,min_lat,max_lon,max_lat)"
    ),
    database: Session = Depends(get_db),
):
    """Get geospatial features with filtering."""
    db_service = DatabaseService(database)
    features = db_service.get_geo_features(
        layer_name=layer_name,
        skip=skip,
        limit=limit,
        feature_type=feature_type,
        is_active=is_active,
        bbox=bbox,
    )

    return FeatureListResponse(
        features=features,
        total=len(features),  # TODO: implement count in service for pagination
        layer_name=layer_name,
        skip=skip,
        limit=limit,
    )


@router.get("/features/{feature_id}", response_model=GeoFeatureResponse)
async def get_geo_feature(
    feature_id: str,
    layer_name: str = Query(..., description="Layer name"),
    database: Session = Depends(get_db),
):
    """Get a specific geospatial feature."""
    db_service = DatabaseService(database)
    return db_service.get_geo_feature(feature_id, layer_name)


@router.put("/features/{feature_id}", response_model=GeoFeatureResponse)
async def update_geo_feature(
    feature_id: str,
    feature_update: GeoFeatureUpdate,
    layer_name: str = Query(..., description="Layer name"),
    database: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update a geospatial feature."""
    db_service = DatabaseService(database)
    return db_service.update_geo_feature(feature_id, layer_name, feature_update)


@router.delete("/features/{feature_id}", status_code=204)
async def delete_geo_feature(
    feature_id: str,
    layer_name: str = Query(..., description="Layer name"),
    database: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Delete a geospatial feature."""
    db_service = DatabaseService(database)
    db_service.delete_geo_feature(feature_id, layer_name)


@router.post("/spatial-query", response_model=SpatialQueryResponse)
async def spatial_query(query: SpatialQuery, database: Session = Depends(get_db)):
    """Perform spatial query on geospatial features."""
    try:
        # Note: You'll need to implement spatial_query in DatabaseService
        raise HTTPException(status_code=501, detail="Spatial query not yet implemented")
    except Exception as error:
        logger.error(f"Failed to perform spatial query: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@router.post(
    "/geoserver/publish", status_code=201, dependencies=[Depends(has_role("admin"))]
)
async def publish_layer_to_geoserver(
    request: LayerPublishRequest, database: Session = Depends(get_db)
):
    """Publish a layer to GeoServer."""
    geoserver_service = GeoServerService()

    if not geoserver_service.test_connection():
        raise HTTPException(status_code=503, detail="Cannot connect to GeoServer")

    geoserver_service.create_workspace(request.workspace)

    success = geoserver_service.publish_layer(request)

    if success:
        return {"message": f"Layer {request.layer_name} published successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to publish layer")


@router.delete(
    "/geoserver/unpublish", status_code=204, dependencies=[Depends(has_role("admin"))]
)
async def unpublish_layer_from_geoserver(
    request: LayerUnpublishRequest, database: Session = Depends(get_db)
):
    """Unpublish a layer from GeoServer."""
    try:
        geoserver_service = GeoServerService()
        success = geoserver_service.unpublish_layer(
            request.layer_name, request.workspace
        )

        if success:
            return {"message": f"Layer {request.layer_name} unpublished successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to unpublish layer")
    except Exception as error:
        logger.error(f"Failed to unpublish layer from GeoServer: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/geoserver/layers")
async def get_geoserver_layers(
    workspace: Optional[str] = Query(None, description="Filter by workspace"),
):
    """Get layers from GeoServer."""
    try:
        geoserver_service = GeoServerService()

        if not geoserver_service.test_connection():
            raise HTTPException(status_code=503, detail="Cannot connect to GeoServer")

        layers = geoserver_service.get_layers(workspace)
        return {"layers": layers, "total": len(layers)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get GeoServer layers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/geoserver/layers/{layer_name}")
async def get_geoserver_layer_info(
    layer_name: str,
    workspace: Optional[str] = Query(None, description="Workspace name"),
):
    """Get layer information from GeoServer."""
    try:
        geoserver_service = GeoServerService()

        if not geoserver_service.test_connection():
            raise HTTPException(status_code=503, detail="Cannot connect to GeoServer")

        layer_info = geoserver_service.get_layer_info(layer_name, workspace)
        if not layer_info:
            raise HTTPException(status_code=404, detail="Layer not found in GeoServer")

        return layer_info
    except HTTPException:
        raise
    except Exception as error:
        # Check if the error is 404 from GeoServerException
        if "404 Client Error" in str(error):
            raise HTTPException(status_code=404, detail="Layer not found in GeoServer")
        logger.error(f"Failed to get GeoServer layer info: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/geoserver/layers/{layer_name}/capabilities")
async def get_layer_capabilities(
    layer_name: str,
    workspace: Optional[str] = Query(None, description="Workspace name"),
):
    """Get layer capabilities (WMS/WFS)."""
    try:
        geoserver_service = GeoServerService()

        if not geoserver_service.test_connection():
            raise HTTPException(status_code=503, detail="Cannot connect to GeoServer")

        capabilities = geoserver_service.get_layer_capabilities(layer_name, workspace)
        return capabilities
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Failed to get layer capabilities: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/geoserver/layers/{layer_name}/wms-url")
async def get_wms_url(
    layer_name: str,
    workspace: Optional[str] = Query(None, description="Workspace name"),
    bbox: Optional[str] = Query(
        None, description="Bounding box (min_lon,min_lat,max_lon,max_lat)"
    ),
    width: int = Query(256, description="Image width"),
    height: int = Query(256, description="Image height"),
    srs: str = Query("EPSG:4326", description="Spatial reference system"),
    format: str = Query("image/png", description="Image format"),
):
    """Generate WMS URL for layer."""
    try:
        geoserver_service = GeoServerService()

        # Parse bbox if provided
        bbox_tuple = None
        if bbox:
            try:
                coords = [float(coordinate) for coordinate in bbox.split(",")]
                if len(coords) == 4:
                    bbox_tuple = tuple(coords)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid bbox format")

        wms_url = geoserver_service.generate_wms_url(
            layer_name=layer_name,
            workspace=workspace,
            bbox=bbox_tuple,
            width=width,
            height=height,
            srs=srs,
            format=format,
        )

        return {"wms_url": wms_url}
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Failed to generate WMS URL: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/geoserver/layers/{layer_name}/wfs-url")
async def get_wfs_url(
    layer_name: str,
    workspace: Optional[str] = Query(None, description="Workspace name"),
    output_format: str = Query("application/json", description="Output format"),
):
    """Generate WFS URL for layer."""
    try:
        geoserver_service = GeoServerService()

        wfs_url = geoserver_service.generate_wfs_url(
            layer_name=layer_name, workspace=workspace, output_format=output_format
        )

        return {"wfs_url": wfs_url}
    except Exception as error:
        logger.error(f"Failed to generate WFS URL: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/geoserver/layers/{layer_name}/geojson")
async def get_layer_geojson(
    layer_name: str,
    workspace: Optional[str] = Query(None, description="Workspace name"),
):
    """Get layer features as GeoJSON directly from GeoServer."""
    try:
        geoserver_service = GeoServerService()

        if not geoserver_service.test_connection():
            raise HTTPException(status_code=503, detail="Cannot connect to GeoServer")

        features = geoserver_service.get_wfs_features(
            layer_name=layer_name, workspace=workspace
        )

        # Remove CRS field - GeoServer WFS returns a CRS that MapLibre rejects
        if isinstance(features, dict) and "crs" in features:
            del features["crs"]

        return features
    except HTTPException:
        raise
    except Exception as error:
        if "404 Client Error" in str(error):
            raise HTTPException(status_code=404, detail="Layer not found in GeoServer")
        logger.error(f"Failed to get layer GeoJSON: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/layers/{layer_name}/sensors")
async def get_sensors_in_layer(
    layer_name: str,
    tenant: Optional[str] = Query(
        None, description="Schema name of the tenant (project)"
    ),
    db: Session = Depends(get_db),
):
    """Get sensors (Things) within the specified layer's geometry."""
    try:
        from app.models.user_context import Project

        db_service = DatabaseService(db)

        schema_name = tenant
        if tenant:
            # Check if tenant is a project ID and resolve to schema_name
            try:
                project = db.query(Project).filter(Project.id == tenant).first()
                if project and project.schema_name:
                    schema_name = project.schema_name
            except Exception:
                db.rollback()
                pass  # tenant is likely not a UUID, use it as schema_name

        sensors = db_service.get_sensors_in_layer(layer_name, schema_name=schema_name)
        return sensors
    except Exception as error:
        logger.error(f"Failed to get sensors in layer {layer_name}: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@router.get("/layers/{layer_name}/bbox")
async def get_layer_bbox(
    layer_name: str,
    db: Session = Depends(get_db),
):
    """Get the bounding box of a layer."""
    try:
        db_service = DatabaseService(db)
        bbox = db_service.get_layer_bbox(layer_name)
        if not bbox:
            raise HTTPException(status_code=404, detail="BBox not found or layer empty")
        return {"bbox": bbox}
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Failed to get bbox for layer {layer_name}: {error}")
        raise HTTPException(status_code=500, detail=str(error))


# ─── Layer-Project Assignment ───────────────────────────────────────────


@router.post("/layers/{layer_name}/assign", status_code=201)
async def assign_layer_to_project(
    layer_name: str,
    body: dict,
    db: Session = Depends(get_db),
):
    """Assign a layer to one or more projects."""
    from app.models.layer_assignment import LayerProjectAssignment

    project_ids = body.get("project_ids", [])
    if not project_ids:
        raise HTTPException(status_code=400, detail="project_ids is required")

    created = []
    for pid in project_ids:
        existing = (
            db.query(LayerProjectAssignment)
            .filter_by(layer_name=layer_name, project_id=str(pid))
            .first()
        )
        if not existing:
            assignment = LayerProjectAssignment(
                layer_name=layer_name, project_id=str(pid)
            )
            db.add(assignment)
            created.append(str(pid))

    db.commit()
    return {"assigned": created, "layer_name": layer_name}


@router.delete("/layers/{layer_name}/assign/{project_id}", status_code=204)
async def unassign_layer_from_project(
    layer_name: str,
    project_id: str,
    db: Session = Depends(get_db),
):
    """Remove a layer-project assignment."""
    from app.models.layer_assignment import LayerProjectAssignment

    assignment = (
        db.query(LayerProjectAssignment)
        .filter_by(layer_name=layer_name, project_id=project_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    db.delete(assignment)
    db.commit()
    return None


@router.get("/layers/{layer_name}/assignments")
async def get_layer_assignments(
    layer_name: str,
    db: Session = Depends(get_db),
):
    """Get all project assignments for a layer."""
    from app.models.layer_assignment import LayerProjectAssignment

    rows = db.query(LayerProjectAssignment).filter_by(layer_name=layer_name).all()
    return {
        "layer_name": layer_name,
        "project_ids": [r.project_id for r in rows],
    }


@router.get("/projects/{project_id}/layers")
async def get_project_layers(
    project_id: str,
    db: Session = Depends(get_db),
):
    """Get all GeoServer layers assigned to a project."""
    from app.models.layer_assignment import LayerProjectAssignment
    from app.models.user_context import Project

    # Build a list of possible IDs to match (both UUID and schema_name)
    possible_ids = [project_id]
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project and project.schema_name:
            possible_ids.append(project.schema_name)
    except Exception:
        pass

    assignments = (
        db.query(LayerProjectAssignment)
        .filter(LayerProjectAssignment.project_id.in_(possible_ids))
        .all()
    )
    layer_names = [a.layer_name for a in assignments]

    if not layer_names:
        return {"layers": [], "total": 0}

    # Fetch layer info from GeoServer for each assigned layer
    try:
        geoserver_service = GeoServerService()
        target_workspace = settings.geoserver_workspace or "water_data"
        all_layers = geoserver_service.get_layers(target_workspace)

        matched = []
        for gs_layer in all_layers:
            if gs_layer.name in layer_names:
                matched.append(
                    {
                        "layer_name": gs_layer.name,
                        "title": gs_layer.title,
                        "workspace": gs_layer.workspace,
                        "is_public": True,
                    }
                )

        return {"layers": matched, "total": len(matched)}
    except Exception as e:
        logger.error(f"Failed to fetch project layers from GeoServer: {e}")
        # Fallback: return just names
        return {
            "layers": [
                {"layer_name": n, "title": n, "is_public": True} for n in layer_names
            ],
            "total": len(layer_names),
        }


# ─── GeoJSON Layer Creation ─────────────────────────────────────────────


@router.post("/layers/from-geojson", status_code=201)
async def create_layer_from_geojson(
    geojson_file: Optional[UploadFile] = File(None),
    geojson_data: Optional[str] = Form(None),
    layer_name: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Create a new layer from GeoJSON data.
    Accepts either:
      - geojson_file: uploaded .json/.geojson file
      - geojson_data: raw GeoJSON string (from map drawing)
    Saves to local DB as geo_layers + geo_features and publishes to GeoServer.
    """
    # 1. Parse GeoJSON
    geojson = None
    if geojson_file:
        content = await geojson_file.read()
        try:
            geojson = json.loads(content)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid GeoJSON file")
    elif geojson_data:
        try:
            geojson = json.loads(geojson_data)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid GeoJSON data")
    else:
        raise HTTPException(
            status_code=400,
            detail="Either geojson_file or geojson_data is required",
        )

    # Validate structure
    if geojson.get("type") not in ("FeatureCollection", "Feature"):
        raise HTTPException(
            status_code=400,
            detail="GeoJSON must be a FeatureCollection or Feature",
        )

    # Normalize to FeatureCollection
    if geojson["type"] == "Feature":
        geojson = {"type": "FeatureCollection", "features": [geojson]}

    features = geojson.get("features", [])
    if not features:
        raise HTTPException(status_code=400, detail="GeoJSON has no features")

    # 2. Determine layer metadata
    import re

    raw_name = (
        (layer_name or f"layer_{uuid_module.uuid4().hex[:8]}").replace(" ", "_").lower()
    )
    safe_name = re.sub(r"[^a-z0-9_]", "", raw_name)
    layer_title = title or safe_name

    # Detect geometry type from first feature
    first_geom = features[0].get("geometry", {})
    geom_type = first_geom.get("type", "Polygon").lower()

    # 3. Create layer record in DB
    from geoalchemy2.shape import from_shape
    from shapely.geometry import shape

    from app.models.geospatial import GeoFeature, GeoLayer

    existing = db.query(GeoLayer).filter_by(layer_name=safe_name).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Layer '{safe_name}' already exists",
        )

    layer_record = GeoLayer(
        layer_name=safe_name,
        title=layer_title,
        description=description or "",
        workspace=settings.geoserver_workspace or "water_data",
        store_name="water_dp_geo",
        srs="EPSG:4326",
        layer_type="vector",
        geometry_type=geom_type,
        is_published="true",
        is_public="true",
    )
    db.add(layer_record)
    db.flush()

    # 4. Add features
    for idx, feat in enumerate(features):
        geom_dict = feat.get("geometry")
        props = feat.get("properties", {})
        if not geom_dict:
            continue

        try:
            shapely_geom = shape(geom_dict)
            wkb_geom = from_shape(shapely_geom, srid=4326)
        except Exception as e:
            logger.warning(f"Skipping feature {idx}: {e}")
            continue

        feature_record = GeoFeature(
            layer_id=safe_name,
            feature_id=f"{safe_name}_{idx}",
            feature_type=geom_type,
            geometry=wkb_geom,
            properties=props,
            is_active="true",
        )
        db.add(feature_record)

    db.commit()

    # 5. Try to publish to GeoServer (best effort)
    try:
        geoserver_service = GeoServerService()
        if geoserver_service.test_connection():
            workspace = settings.geoserver_workspace or "water_data"
            geoserver_service.create_workspace(workspace)

            # Initialize datastore if missing
            import socket

            from sqlalchemy.engine.url import make_url

            db_url = make_url(settings.database_url)
            db_host_name = db_url.host or "database"
            try:
                db_host_ip = socket.gethostbyname(db_host_name)
            except Exception:
                db_host_ip = db_host_name

            geoserver_service.create_datastore(
                store_name="water_dp_geo",
                store_type="postgis",
                connection_params={
                    "host": db_host_ip,
                    "port": str(db_url.port or 5432),
                    "database": db_url.database or "postgres",
                    "user": db_url.username or "postgres",
                    "passwd": db_url.password or "postgres",
                    "dbtype": "postgis",
                    "schema": "water_dp",
                    "Expose primary keys": "true",
                },
            )

            # Publish as SQL view pointing to geo_features table
            sql = (
                "SELECT gf.feature_id, gf.geometry, gf.properties FROM geo_features gf WHERE gf.layer_id = '"
                + safe_name
                + "' AND gf.is_active = 'true'"
            )
            geoserver_service.publish_sql_view(
                layer_name=safe_name,
                store_name="water_dp_geo",
                sql=sql,
                workspace=workspace,
                title=layer_title,
            )
            logger.info(f"Published layer '{safe_name}' to GeoServer")
    except Exception as e:
        logger.error(f"Could not publish to GeoServer: {e}")
        # Delete the layer from DB since publishing failed (rollback)
        try:
            db.delete(layer_record)
            db.commit()
        except Exception as rollback_err:
            logger.error(
                f"Rollback failed after GeoServer publish error: {rollback_err}"
            )
        raise HTTPException(
            status_code=500,
            detail="Layer saved to DB but failed to publish to GeoServer",
        )

    return {
        "layer_name": safe_name,
        "title": layer_title,
        "features_count": len(features),
        "geometry_type": geom_type,
    }
