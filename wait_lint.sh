#!/bin/bash
while true; do
  if npm run lint > /dev/null 2>&1; then
    echo "Lint clean"
    break
  else
    npm run lint > lint_error.txt
    echo "Lint error"
    break
  fi
  sleep 1
done
