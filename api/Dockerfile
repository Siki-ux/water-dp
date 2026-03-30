FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /build

# Install build dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry and dependencies
RUN pip install --no-cache-dir poetry==1.8.2 \
    && poetry config virtualenvs.create false

COPY pyproject.toml poetry.lock* ./
RUN poetry install --no-interaction --no-ansi --no-root --only main


# --- Runtime stage ---
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

WORKDIR /app

# Install only runtime dependencies (no build-essential)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    postgresql-client \
    gdal-bin \
    libpq5 \
    libgeos-c1v5 \
    && rm -rf /var/lib/apt/lists/*

# Set GDAL environment variables
ENV GDAL_DATA=/usr/share/gdal
ENV GEOS_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libgeos_c.so
ENV GDAL_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libgdal.so

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser:appuser /app

# Copy project
COPY --chown=appuser:appuser . .
USER appuser

EXPOSE 8000

RUN chmod +x /app/scripts/start.sh
CMD ["/app/scripts/start.sh"]
