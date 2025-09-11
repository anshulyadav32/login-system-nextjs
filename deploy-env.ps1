# Script to deploy environment variables from .env to Vercel
# Usage: .\deploy-env.ps1

Write-Host "Starting deployment of environment variables to Vercel..." -ForegroundColor Green

# Read .env file and filter environment variables
$envVars = Get-Content .env | Where-Object { 
    $_ -match '^[A-Z_]+=.*' -and 
    $_ -notmatch '^#' -and 
    $_.Trim() -ne '' 
}

$successCount = 0
$errorCount = 0

foreach ($line in $envVars) {
    # Split the line into name and value
    $parts = $line -split '=', 2
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    
    # Remove quotes from value if present
    $value = $value -replace '^"(.*)"$', '$1'
    
    Write-Host "Adding $name to Vercel Production..." -ForegroundColor Yellow
    
    try {
        # Pipe value into vercel env add (no --yes in CLI v47+)
        $result = $value | vercel env add $name production 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Successfully added $name" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "❌ Failed to add $name : $result" -ForegroundColor Red
            $errorCount++
        }
    }
    catch {
        Write-Host "❌ Error adding $name : $($_.Exception.Message)" -ForegroundColor Red
        $errorCount++
    }
    
    # Small delay to avoid rate limiting
    Start-Sleep -Milliseconds 500
}

Write-Host "`nDeployment Summary:" -ForegroundColor Cyan
Write-Host "✅ Success: $successCount variables" -ForegroundColor Green
Write-Host "❌ Errors: $errorCount variables" -ForegroundColor Red
Write-Host "Total processed: $($successCount + $errorCount) variables" -ForegroundColor White

if ($errorCount -eq 0) {
    Write-Host "`n🎉 All environment variables deployed successfully!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Some variables failed to deploy. Check the errors above." -ForegroundColor Yellow
}
