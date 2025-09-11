# Script to remove all environment variables from Vercel
# Usage: .\remove-env.ps1

Write-Host "Starting removal of all environment variables from Vercel..." -ForegroundColor Red

# Get list of environment variables
$envOutput = vercel env ls --json 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to get environment variables list" -ForegroundColor Red
    exit 1
}

# Parse JSON output to get variable names and environments
try {
    $envData = $envOutput | ConvertFrom-Json
    $envVars = $envData.envs
    
    if ($envVars.Count -eq 0) {
        Write-Host "✅ No environment variables found to remove" -ForegroundColor Green
        exit 0
    }
    
    Write-Host "Found $($envVars.Count) environment variables to remove" -ForegroundColor Yellow
    
    $successCount = 0
    $errorCount = 0
    
    foreach ($env in $envVars) {
        $name = $env.key
        $environments = $env.target
        
        # Handle different environment formats
        if ($environments -is [array]) {
            $envList = $environments
        } else {
            $envList = @($environments)
        }
        
        foreach ($environment in $envList) {
            Write-Host "Removing $name from $environment..." -ForegroundColor Yellow
            
            try {
                $result = vercel env rm $name $environment --yes 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "✅ Successfully removed $name from $environment" -ForegroundColor Green
                    $successCount++
                } else {
                    Write-Host "❌ Failed to remove $name from $environment : $result" -ForegroundColor Red
                    $errorCount++
                }
            }
            catch {
                Write-Host "❌ Error removing $name from $environment : $_.Exception.Message" -ForegroundColor Red
                $errorCount++
            }
            
            # Small delay to avoid rate limiting
            Start-Sleep -Milliseconds 300
        }
    }
    
    Write-Host "`nRemoval Summary:" -ForegroundColor Cyan
    Write-Host "✅ Success: $successCount removals" -ForegroundColor Green
    Write-Host "❌ Errors: $errorCount removals" -ForegroundColor Red
    Write-Host "Total processed: $($successCount + $errorCount) removals" -ForegroundColor White
    
    if ($errorCount -eq 0) {
        Write-Host "`n🎉 All environment variables removed successfully!" -ForegroundColor Green
    } else {
        Write-Host "`n⚠️  Some variables failed to be removed. Check the errors above." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "❌ Failed to parse environment variables: $_.Exception.Message" -ForegroundColor Red
    
    # Fallback: try to remove common variables manually
    Write-Host "Trying fallback method..." -ForegroundColor Yellow
    
    $commonVars = @(
        "NEXTAUTH_URL", "NEXTAUTH_SECRET", "ALLOWED_ORIGINS", 
        "POSTGRES_URL", "POSTGRES_USER", "POSTGRES_HOST", "POSTGRES_PASSWORD", "POSTGRES_DATABASE",
        "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING",
        "SUPABASE_JWT_SECRET", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NODE_ENV"
    )
    
    foreach ($var in $commonVars) {
        Write-Host "Attempting to remove $var from Production..." -ForegroundColor Yellow
        vercel env rm $var production --yes 2>$null
        
        Write-Host "Attempting to remove $var from Preview..." -ForegroundColor Yellow
        vercel env rm $var preview --yes 2>$null
        
        Write-Host "Attempting to remove $var from Development..." -ForegroundColor Yellow
        vercel env rm $var development --yes 2>$null
    }
}