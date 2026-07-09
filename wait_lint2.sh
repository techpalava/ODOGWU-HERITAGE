#!/bin/bash
while true; do
  if npm run lint > /dev/null 2>&1; then
    break
  else
    npm run lint > lint_error2.txt
    break
  fi
  sleep 1
done
