#!/bin/sh
# Run from the extracted deployment directory. Full backup contains credentials.
set -eu
umask 077
destination=${1:-"backups/$(date -u +%Y%m%dT%H%M%SZ)"}
test ! -e "$destination" || { echo '目标目录已存在，请使用新目录' >&2; exit 1; }
test -f .env || { echo '请在部署目录运行' >&2; exit 1; }
mkdir -p "$destination"
docker compose stop enterprise gateway
trap 'docker compose up -d enterprise gateway' EXIT HUP INT TERM
docker compose exec -T database pg_dump -U enterprise -d enterprise -Fc > "$destination/database.dump"
docker compose run --rm --no-deps --entrypoint tar enterprise -C /data -czf - . > "$destination/enterprise-data.tar.gz"
docker compose run --rm --no-deps --entrypoint tar gateway -C /data -czf - . > "$destination/caddy-data.tar.gz"
cp .env "$destination/environment.env"
cp compose.yaml "$destination/compose.yaml"
sha256sum "$destination"/database.dump "$destination"/*.tar.gz "$destination/environment.env" > "$destination/SHA256SUMS.txt"
echo "完整备份已生成：$destination。请加密保管并测试恢复。"
