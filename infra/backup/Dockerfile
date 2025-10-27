FROM postgres:16

RUN apt-get update \
    && apt-get install -y --no-install-recommends cron awscli dos2unix \
    && rm -rf /var/lib/apt/lists/*

ENV BACKUP_DIR=/backups

COPY backup.sh /usr/local/bin/backup.sh
COPY cron-wrapper.sh /usr/local/bin/backup-cron-wrapper.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN dos2unix /usr/local/bin/backup.sh \
    /usr/local/bin/backup-cron-wrapper.sh \
    /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/backup.sh \
    /usr/local/bin/backup-cron-wrapper.sh \
    /usr/local/bin/entrypoint.sh

VOLUME ["/backups"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/usr/local/bin/entrypoint.sh"]
