FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY scripts ./scripts
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN apt-get update \
 && apt-get install -y --no-install-recommends dos2unix \
 && rm -rf /var/lib/apt/lists/* \
 && dos2unix /app/docker-entrypoint.sh /app/scripts/run-migrations.sh \
 && chmod +x /app/docker-entrypoint.sh /app/scripts/run-migrations.sh

RUN pip install --upgrade pip && pip install --no-cache-dir .

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
