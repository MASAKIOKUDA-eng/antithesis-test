# System Under Test: toy ledger service (stdlib only, no third-party deps).
# Antithesis runs x86-64 containers, so the platform is pinned.
FROM docker.io/library/python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BANK_DB_PATH=/data/bank.db \
    BANK_PORT=8080 \
    BANK_BUG_MODE=none

# Run as an unprivileged user; /data holds the SQLite database.
RUN groupadd --system --gid 10001 bank \
 && useradd --system --uid 10001 --gid bank --no-create-home --shell /usr/sbin/nologin bank \
 && mkdir -p /data /app \
 && chown bank:bank /data

COPY --chown=root:root --chmod=0444 app.py /app/app.py

USER 10001:10001
WORKDIR /app
EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=2).status == 200 else 1)"]

ENTRYPOINT ["python", "/app/app.py"]
