#!/usr/bin/env bash
# ========================================================
# StudyTrack Pro - GitHub Synchronization Script
# ========================================================

set -e

echo "🚀 Synchronizing StudyTrack Pro to GitHub..."

# Ensure all files are staged
git add .

# Prompt for commit message or use default
COMMIT_MSG="${1:-feat: update StudyTrack Pro student task manager}"
git commit -m "$COMMIT_MSG" || echo "No new changes to commit."

# Push to GitHub
echo "📤 Pushing to branch 'studytrack-pro' on GitHub..."
git push origin main:studytrack-pro

echo "✅ Successfully pushed to GitHub!"
echo "🔗 View at: https://github.com/tamilsabari397-dev/student-management-system/tree/studytrack-pro"
