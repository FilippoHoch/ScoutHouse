FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir ruff==0.6.8 mypy==1.13.0 bandit==1.7.10

WORKDIR /workspace

COPY infra/lint/run-lint-report.sh /usr/local/bin/run-lint-report.sh
RUN chmod +x /usr/local/bin/run-lint-report.sh

ENTRYPOINT ["/usr/local/bin/run-lint-report.sh"]
