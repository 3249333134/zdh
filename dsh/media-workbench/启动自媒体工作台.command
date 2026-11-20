#!/bin/zsh
set -eu
umask 077
cd -- "${0:A:h}"

root=${PWD:A:h:h}
media=$PWD
node="$root/.local-dsh/toolchain/node-v24.21.0-darwin-$(uname -m)/bin/node"
entry="$root/upstream/deepseek-harness-master/apps/cli/lib/bin.js"
canvas_entry="$media/runtime/canvas-server-macos"
canvas_frontend="$media/canvas-web.cjs"
patch="$media/runtime/macos-web.patch.json"
export DSH_HOME="$media/data/macos-web" DSH_TELEMETRY_DISABLED=1
args=(web --patch "$patch" --no-open --host 127.0.0.1 --port 33280)

mkdir -p logs
touch logs/macos-web.lock
zmodload zsh/system
zsystem flock -t 10 logs/macos-web.lock

running_pid() {
  local pid command_line pid_file="$media/logs/$1.pid"
  [[ -s $pid_file ]] || return 1
  IFS= read -r pid < "$pid_file"
  [[ $pid == <-> ]] || return 1
  command_line=$(ps -ww -p "$pid" -o command= 2>/dev/null) || return 1
  [[ $command_line == "$2" ]] || return 1
  print -r -- "$pid"
}

stop_job() {
  local pid
  if pid=$(running_pid "$1" "$2"); then kill -TERM "$pid"; fi
}

web_command="$node $entry ${(j: :)args}"
if [[ ${1:-} == stop ]]; then
  stop_job macos-web "$web_command"
  stop_job macos-canvas-web "$node $canvas_frontend"
  stop_job macos-canvas "$canvas_entry"
  exit 0
fi

if [[ ! -x $node || ! -f $entry || ! -x $canvas_entry ||
      ! -f "$media/runtime/canvas-web/index.html" || ! -f "$DSH_HOME/profiles/web/node_modules/dsh-media-desk/dist/client.js" ]]; then
  print -u2 '请先构建本机 DSH、自媒体插件和影策前后端。'
  exit 1
fi

export PATH="${node:h}:$PATH"
mkdir -p "$DSH_HOME/workspace" "$DSH_HOME/canvas"
if ! running_pid macos-web "$web_command" >/dev/null; then
  "$node" "$media/macos-native.cjs" prepare "$patch"
fi
export WORKBENCH_BROWSER_AUTH=1 WORKBENCH_ASSET_INDEX="$DSH_HOME/local-assets.json"
export WORKBENCH_NATIVE_KEY="$(<"$DSH_HOME/native-key")"

start_job() {
  local label=$1 command_line=$2 directory=$3 log_file="$media/logs/$1.log"
  shift 3
  if ! running_pid "$label" "$command_line" >/dev/null; then
    : > "$log_file"
    (cd -- "$directory"; exec nohup "$@") </dev/null >>"$log_file" 2>&1 &!
    print -r -- "$!" > "$media/logs/$label.pid"
  fi
}

wait_for() {
  local url=$1 label=$2 command_line=$3
  for attempt in {1..40}; do
    if curl --noproxy '*' -fsS --max-time 1 -o /dev/null "$url" 2>/dev/null &&
        running_pid "$label" "$command_line" >/dev/null; then return 0; fi
    sleep 1
    if ! running_pid "$label" "$command_line" >/dev/null; then break; fi
  done
  print -u2 "服务启动失败，查看 $media/logs/$label.log"
  return 1
}

start_job macos-canvas "$canvas_entry" "$root/dsh/open-ai-canvas/backend" /usr/bin/env \
  CANVAS_BACKEND_ADDR=127.0.0.1:18081 "CANVAS_BACKEND_DATA_DIR=$DSH_HOME/canvas" \
  CANVAS_DATABASE_DRIVER=sqlite CANVAS_AUTO_MIGRATE=true CANVAS_REGISTRATION_ENABLED=false \
  CANVAS_CORS_ORIGINS=http://127.0.0.1:13001 GIN_MODE=release "$canvas_entry"
wait_for http://127.0.0.1:18081/api/health/ready macos-canvas "$canvas_entry"

start_job macos-canvas-web "$node $canvas_frontend" "$media" "$node" "$canvas_frontend"
wait_for http://127.0.0.1:13001/api/health/ready macos-canvas-web "$node $canvas_frontend"

export WORKBENCH_AI_KEY="$("$node" "$media/macos-native.cjs" key)"
start_job macos-web "$web_command" "$DSH_HOME/workspace" "$node" "$entry" "${args[@]}"
log_file="$media/logs/macos-web.log"

for attempt in {1..30}; do
  url=$(awk '/^dsh web: http:\/\/127\.0\.0\.1:33280\/\?token=/ {url=$3} END {print url}' "$log_file")
  if [[ -n $url ]] && curl --noproxy '*' -fsS --max-time 1 -o /dev/null "$url"; then
    if [[ ${1:-} != --no-open ]]; then open "$url"; fi
    print '自媒体工作台网页版已启动（127.0.0.1:33280）。'
    exit 0
  fi
  sleep 1
  if ! running_pid macos-web "$web_command" >/dev/null; then break; fi
done

print -u2 "自媒体工作台启动失败，查看 $log_file"
exit 1
