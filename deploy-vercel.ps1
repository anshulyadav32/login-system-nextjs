 # Vercel Deployment Script
# This script helps deploy the Next.js backend API to Vercel

Write-Host "Starting Vercel deployment..." -ForegroundColor Green

# Check if Vercel CLI is installed
if (!(Get-Command "vercel" -ErrorAction SilentlyContinue)) {
    Write-Host "Vercel CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g vercel
}

# Login to Vercel (if not already logged in)
Write-Host "Checking Vercel authentication..." -ForegroundColor Blue
vercel whoami

if ($LASTEXITCODE -ne 0) {
    Write-Host "Please login to Vercel:" -ForegroundColor Yellow
    vercel login
}

# Set environment variables (you'll need to add these in Vercel dashboard)
Write-Host "Remember to set these environment variables in Vercel dashboard:" -ForegroundColor Cyan
Write-Host "- DATABASE_URL" -ForegroundColor White
Write-Host "- NEXTAUTH_SECRET" -ForegroundColor White
Write-Host "- NEXTAUTH_URL" -ForegroundColor White
Write-Host "- EMAIL_SERVER_HOST" -ForegroundColor White
Write-Host "- EMAIL_SERVER_PORT" -ForegroundColor White
Write-Host "- EMAIL_SERVER_USER" -ForegroundColor White
Write-Host "- EMAIL_SERVER_PASSWORD" -ForegroundColor White
Write-Host "- EMAIL_FROM" -ForegroundColor White

# Deploy to Vercel
Write-Host "Deploying to Vercel..." -ForegroundColor Green
vercel --prod

Write-Host "Deployment completed!" -ForegroundColor Green
Write-Host "Don't forget to:" -ForegroundColor Yellow
Write-Host "1. Set up your production database" -ForegroundColor White
Write-Host "2. Run database migrations on production" -ForegroundColor White
Write-Host "3. Configure your domain settings" -ForegroundColor White