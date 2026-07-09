#!/bin/bash
while true; do
  if npm run lint > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
