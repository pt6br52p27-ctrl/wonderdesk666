#!/usr/bin/env bash
# Starts WanderDesk. Works from ANY folder and checks common mistakes first.
#
#   bash start.sh           run with Node.js  (http://127.0.0.1:3000)
#   bash start.sh docker    run with Docker   (http://localhost:3000)
#   bash start.sh test      run the server tests and the HTML/contrast checks
set -e

# Always work from the folder this script lives in, so "wrong folder" errors cannot happen.
cd "$(dirname "$0")"

if [ ! -d public ] || [ ! -f server/server.js ] || [ ! -f package.json ]; then
  echo "ERROR: this folder is missing public/, server/ or package.json."
  echo "Unzip wanderdesk-submission.zip completely and run this script from inside the 'wanderdesk' folder."
  exit 1
fi

need_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: Node.js is not installed."
    echo "Install it with:  conda install -c conda-forge nodejs -y   (or brew install node, or https://nodejs.org)"
    echo "Then close and reopen Terminal and run this script again."
    exit 1
  fi
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -lt 18 ]; then
    echo "ERROR: Node.js $major is too old. Version 18 or newer is needed (you have $(node --version))."
    exit 1
  fi
}

case "${1:-node}" in
  docker)
    if ! command -v docker >/dev/null 2>&1; then
      echo "ERROR: Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
      exit 1
    fi
    if ! docker info >/dev/null 2>&1; then
      echo "ERROR: Docker is installed but not running."
      echo "Open Docker Desktop, wait until it says 'Docker Desktop is running', then run this again."
      exit 1
    fi
    if [ ! -f Dockerfile ]; then
      echo "ERROR: Dockerfile is missing from $(pwd)."
      exit 1
    fi
    if [ "$(head -c 2 Dockerfile)" = "PK" ]; then
      echo "ERROR: 'Dockerfile' is actually a zip file. Delete it and unzip the project again."
      exit 1
    fi
    echo "Building and starting with Docker... open http://localhost:3000 when it says the server is running."
    exec docker compose up --build
    ;;
  test)
    need_node
    npm test
    npm run check
    ;;
  node|"")
    need_node
    echo "Starting WanderDesk. Open http://127.0.0.1:${PORT:-3000}  (sign in: agent / agent123). Press Ctrl+C to stop."
    exec node server/server.js
    ;;
  *)
    echo "Unknown option '$1'. Use:  bash start.sh | bash start.sh docker | bash start.sh test"
    exit 1
    ;;
esac
