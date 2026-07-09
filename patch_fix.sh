#!/bin/bash
sed -i 's/{/\* Right Column \*/}/<\/div>\n        {/\* Right Column \*/}/g' src/components/DashboardView.tsx
