FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps for psycopg/bcrypt, pg_restore, and rclone
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl postgresql-client unzip \
    && rm -rf /var/lib/apt/lists/*

# Install rclone for Google Drive backup support
RUN curl -fsSL https://rclone.org/install.sh | bash

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install .

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
