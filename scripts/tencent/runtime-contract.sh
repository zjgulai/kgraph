#!/usr/bin/env bash
# Shared fail-closed helpers for local and production Docker acceptance scripts.

readonly DOCCANVAS_DOCKER_HEALTH_STATUS_TEMPLATE='{{with (index .State "Health")}}{{index . "Status"}}{{else}}none{{end}}'
readonly DOCCANVAS_DOCKER_IMAGE_HEALTHCHECK_TEMPLATE='{{with (index .Config "Healthcheck")}}{{json (index . "Test")}}{{else}}none{{end}}'
readonly DOCCANVAS_DOCKER_RUNTIME_STATE_TEMPLATE='{{.Id}}|{{.State.Status}}|{{with (index .State "Health")}}{{index . "Status"}}{{else}}none{{end}}|{{.RestartCount}}|{{.State.OOMKilled}}|{{with (index .Config "Healthcheck")}}{{json (index . "Test")}}{{else}}none{{end}}'

doccanvas_docker_health_status() {
  [[ "$#" -eq 1 ]] || return 64
  docker inspect --format "${DOCCANVAS_DOCKER_HEALTH_STATUS_TEMPLATE}" "$1"
}

doccanvas_docker_image_healthcheck_test() {
  [[ "$#" -eq 1 ]] || return 64
  docker image inspect --format "${DOCCANVAS_DOCKER_IMAGE_HEALTHCHECK_TEMPLATE}" "$1"
}

doccanvas_docker_container_healthcheck_test() {
  [[ "$#" -eq 1 ]] || return 64
  docker inspect --format "${DOCCANVAS_DOCKER_IMAGE_HEALTHCHECK_TEMPLATE}" "$1"
}

doccanvas_docker_runtime_state() {
  [[ "$#" -eq 1 ]] || return 64
  docker inspect --format "${DOCCANVAS_DOCKER_RUNTIME_STATE_TEMPLATE}" "$1"
}

doccanvas_same_file() {
  [[ "$#" -eq 2 && -e "$1" && -e "$2" ]] || return 1
  [[ "$1" -ef "$2" ]]
}

doccanvas_verify_inherited_lock_fd() {
  [[ "$#" -eq 2 ]] || return 64
  local fd=$1 lock_file=$2 path_lock_status=0 fd_lock_status=0
  [[ "${fd}" =~ ^[0-9]+$ ]] || return 64
  local fd_path="/proc/$$/fd/${fd}"
  [[ -e "${fd_path}" ]] || return 1
  doccanvas_same_file "${fd_path}" "${lock_file}" || return 1
  flock -n --conflict-exit-code 75 "${lock_file}" true >/dev/null 2>&1 || path_lock_status=$?
  [[ "${path_lock_status}" -eq 75 ]] || return 1
  flock -n --conflict-exit-code 75 "${fd}" >/dev/null 2>&1 || fd_lock_status=$?
  [[ "${fd_lock_status}" -eq 0 ]]
}
