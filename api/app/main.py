"""
Main FastAPI application.
"""

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.api import api_router
from app.core.config import settings
from app.core.constants import API_DESCRIPTION
from app.core.database import init_db
from app.core.logging_config import setup_logging
from app.core.middleware import ErrorHandlingMiddleware, LoggingMiddleware
from app.core.rate_limit import limiter

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info("Starting Water Data Platform API...")

    # Initialize startup state
    app.state.startup_complete = False

    try:
        # Ensure tables exist (create_all is idempotent - won't recreate existing tables)
        init_db()
        logger.info("Database initialized successfully")

        logger.info("Application starting...")

        app.state.startup_complete = True
        logger.info("Application is now fully healthy and ready.")

    except Exception as error:
        logger.error(f"Failed to initialize database: {error}")
        raise

    yield

    logger.info("Shutting down Water Data Platform API...")


app = FastAPI(
    root_path=os.getenv("ROOT_PATH", ""),
    title=settings.app_name,
    version=settings.version,
    description=API_DESCRIPTION,
    openapi_url=f"{settings.api_prefix}/openapi.json" if settings.debug else None,
    docs_url=f"{settings.api_prefix}/docs" if settings.debug else None,
    redoc_url=f"{settings.api_prefix}/redoc" if settings.debug else None,
    lifespan=lifespan,
    contact={
        "name": "Water Data Platform Support",
        "email": "support@waterdataplatform.com",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
    servers=(
        [
            {
                "url": f"{os.getenv('ROOT_PATH', '')}",
                "description": "Current Environment",
            },
            {"url": "http://localhost:8000", "description": "Local Development"},
        ]
        if os.getenv("ROOT_PATH")
        else [
            {"url": "http://localhost:8000", "description": "Development"},
            {"url": "https://api.waterdataplatform.com", "description": "Production"},
        ]
    ),
)


@app.get("/health", tags=["General"])
async def health_check(response: Response):
    """Health check endpoint. Returns 503 while initializing."""
    if not getattr(app.state, "startup_complete", False):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "initializing",
            "message": "Seeding data in progress...",
            "app_name": settings.app_name,
            "timestamp": time.time(),
        }

    return {
        "status": "healthy",
        "app_name": settings.app_name,
        "version": settings.version,
        "timestamp": time.time(),
    }


# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middleware Stack (Executed Top to Bottom)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts_list)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(ErrorHandlingMiddleware)
app.add_middleware(LoggingMiddleware)


@app.get("/docs", tags=["General"])
async def redirect_to_swagger():
    """Redirect to Swagger UI."""
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url=f"{settings.api_prefix}/docs")


@app.get("/", tags=["General"])
async def root():
    """Root endpoint with API information and links."""
    root_path = os.getenv("ROOT_PATH", "")
    api_prefix = settings.api_prefix

    return {
        "message": "Water Data Platform API",
        "version": settings.version,
        "status": "running",
        "documentation": {
            "swagger_ui": f"{root_path}{api_prefix}/docs",
            "redoc": f"{root_path}{api_prefix}/redoc",
            "openapi_json": f"{root_path}{api_prefix}/openapi.json",
        },
        "endpoints": {
            "sensors": f"{root_path}{api_prefix}/things/",
            "geospatial": f"{root_path}{api_prefix}/geospatial/",
            "projects": f"{root_path}{api_prefix}/projects/",
            "health": f"{root_path}/health",
        },
        "health_url": f"{root_path}/health",
    }


app.include_router(api_router, prefix=settings.api_prefix)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
