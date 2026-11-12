# Workload / test-driver image.
# Test Composer commands live under /opt/antithesis/test/v1/<test name>/.
FROM docker.io/library/python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/opt/workload/lib

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --disable-pip-version-check --require-hashes -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt \
 && groupadd --system --gid 10002 workload \
 && useradd --system --uid 10002 --gid workload --no-create-home --shell /usr/sbin/nologin workload \
 && mkdir -p /sdk-output && chown workload:workload /sdk-output

COPY --chown=root:root --chmod=0555 lib/ /opt/workload/lib/
COPY --chown=root:root --chmod=0555 entrypoint.py /opt/workload/entrypoint.py
COPY --chown=root:root --chmod=0555 test/ /opt/antithesis/test/

USER 10002:10002
ENTRYPOINT ["python", "/opt/workload/entrypoint.py"]
