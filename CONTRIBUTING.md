# Contributing Guide

Thank you for your interest in improving ScoutHouse! This document covers the
minimum setup needed to contribute safely to the backend.

## Local development environment

The backend uses [Poetry](https://python-poetry.org/) for dependency
management. To avoid permission issues and security warnings such as "pip
executed as root", always work inside a virtual environment owned by your local
user.

1. Install Poetry for your user account following the official instructions.
2. From the repository root, change into the backend directory and let Poetry
   create an isolated virtual environment:

   ```bash
   cd backend
   poetry env use python3.12
   poetry install
   ```

   Poetry automatically creates the virtual environment outside the project
   tree. You can inspect its location with `poetry env info --path`.

3. Activate the environment before running any `poetry run` or `pytest`
   commands:

   ```bash
   source "$(poetry env info --path)/bin/activate"
   ```

   When the virtual environment is active you can use `poetry run` or directly
   invoke installed tools.

If you prefer the Python standard library tooling, create a virtual environment
manually and install Poetry inside it so that every subsequent `poetry install`
also runs as a non-root user:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install poetry
```

> **Note**
> Never run `pip` as the `root` user. Always install dependencies inside a
> virtual environment owned by your user account. This prevents your system
> interpreter from being modified unexpectedly and keeps Poetry's lock file in
> sync.

## Dependency updates

After modifying dependencies in `backend/pyproject.toml`, regenerate the lock
file to capture the exact, vetted versions:

```bash
cd backend
poetry lock
```

Commit both `pyproject.toml` and `poetry.lock` together so automated tooling
and other contributors can reproduce the environment exactly.
