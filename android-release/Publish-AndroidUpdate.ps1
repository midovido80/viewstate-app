param(
    [string]$SourceFolder,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'

function Get-PilotSource([string]$Folder) {
    $publisher = Join-Path $Folder 'scripts\publish-pilot-update.mjs'
    if (-not (Test-Path -LiteralPath $publisher -PathType Leaf)) { return }

    $mobile = Join-Path $Folder 'artifacts\mobile'
    $app = (Get-Content -LiteralPath (Join-Path $mobile 'app.json') -Raw | ConvertFrom-Json).expo
    $build = (Get-Content -LiteralPath (Join-Path $mobile 'eas.json') -Raw | ConvertFrom-Json).build.internal
    if ($app.android.package -ne 'com.midovido80.viewstateapp' -or
        $app.extra.eas.projectId -ne 'd6978e84-7f06-4074-a641-eef1f9b9021c' -or
        $app.updates.url -ne 'https://u.expo.dev/d6978e84-7f06-4074-a641-eef1f9b9021c' -or
        $app.runtimeVersion -notmatch '^viewstate-next-android-[0-9]{1,6}$' -or
        $build.channel -ne 'viewstate-next-pilot' -or $build.environment -ne 'preview') {
        return
    }

    [pscustomobject]@{
        Folder = $Folder
        Publisher = $publisher
        Runtime = $app.runtimeVersion
        HasDependencies = Test-Path -LiteralPath (Join-Path $mobile 'node_modules\expo\package.json')
    }
}

try {
    if ($SourceFolder) {
        $source = Get-PilotSource (Resolve-Path -LiteralPath $SourceFolder).Path
    } else {
        $downloads = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
        $source = Get-ChildItem -LiteralPath $downloads -Directory -Filter 'viewstate-next*' |
            Sort-Object LastWriteTime -Descending |
            ForEach-Object { Get-PilotSource $_.FullName } |
            Select-Object -First 1
    }

    if ($Check) {
        if (-not $source) { throw 'No matching ViewState Android Pilot source folder was found.' }
        if (-not $source.HasDependencies) { throw 'Expo dependencies are missing from the selected source folder.' }
        Get-Command node.exe -ErrorAction Stop | Out-Null
        Write-Host "Source: $($source.Folder)"
        Write-Host "Android Pilot runtime: $($source.Runtime)"
        exit 0
    }

    Add-Type -AssemblyName System.Windows.Forms
    $title = 'Publish Android Update'

    while ($true) {
        if ($source -and $source.HasDependencies) {
            $message = "Publish this source to Android Pilot?`n`n$($source.Folder)`nRuntime: $($source.Runtime)`n`nYes: Publish  |  No: Choose another folder"
            $choice = [Windows.Forms.MessageBox]::Show($message, $title, 'YesNoCancel', 'Question', 'Button3')
            if ($choice -eq 'Yes') { break }
            if ($choice -eq 'Cancel') { exit 0 }
        } else {
            [Windows.Forms.MessageBox]::Show('Choose the ViewState Android Pilot source folder with its Expo dependencies installed.', $title, 'OK', 'Information') | Out-Null
        }

        $picker = New-Object Windows.Forms.FolderBrowserDialog
        try {
            $picker.Description = 'Choose the ViewState Android Pilot source folder'
            if ($source) { $picker.SelectedPath = $source.Folder }
            if ($picker.ShowDialog() -ne 'OK') { exit 0 }
            $source = Get-PilotSource $picker.SelectedPath
        } finally {
            $picker.Dispose()
        }
    }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $storage = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ViewStateRelease'
    $credential = Join-Path $storage 'worker-secret.dpapi'
    $originalSecret = $env:CIRCLE_WORKER_SECRET
    $secretEntered = $false
    try {
        if (-not $env:CIRCLE_WORKER_SECRET) {
            if (Test-Path -LiteralPath $credential) {
                $secureSecret = Get-Content -LiteralPath $credential -Raw | ConvertTo-SecureString
            } else {
                $secureSecret = Read-Host 'Enter the existing Circle worker secret (input is hidden)' -AsSecureString
                if ($secureSecret.Length -eq 0) { throw 'The worker secret is required to announce the update.' }
                $secretEntered = $true
            }
            $env:CIRCLE_WORKER_SECRET = [Net.NetworkCredential]::new('', $secureSecret).Password
        }

        $revision = (Split-Path $source.Folder -Leaf) -replace '[^a-zA-Z0-9 ._+-]', '-'
        $description = "Android Pilot $revision $(Get-Date -Format 'yyyy-MM-dd HH-mm')"
        Write-Host "Publishing $revision. Leave this window open until it finishes."
        & $node $source.Publisher $description | Tee-Object -Variable publishOutput
        $publishExit = $LASTEXITCODE

        if ($publishExit -ne 0) {
            $announcement = $publishOutput | Select-String '^Published Android Pilot update group: ([0-9a-f-]{36})$' | Select-Object -Last 1
            if (-not $announcement) { throw 'The publisher failed. Check the output above and Expo before retrying.' }

            $group = $announcement.Matches[0].Groups[1].Value
            $retry = [Windows.Forms.MessageBox]::Show("Expo published the update. The Supabase announcement failed.`n`nRetry the announcement for $group?", $title, 'YesNo', 'Warning')
            if ($retry -ne 'Yes') { throw "Expo update $group is published. Its announcement is pending." }
            $retrySecret = Read-Host 'Enter the worker secret again, or press Enter to reuse it' -AsSecureString
            if ($retrySecret.Length -gt 0) {
                $secureSecret = $retrySecret
                $env:CIRCLE_WORKER_SECRET = [Net.NetworkCredential]::new('', $secureSecret).Password
                $secretEntered = $true
            }
            & $node $source.Publisher '--announce' $group
            if ($LASTEXITCODE -ne 0) { throw "Expo update $group is published. Its announcement is pending." }
        }

        if ($secretEntered) {
            try {
                New-Item -ItemType Directory -Path $storage -Force | Out-Null
                $secureSecret | ConvertFrom-SecureString | Set-Content -LiteralPath $credential -Encoding ASCII
            } catch {
                Write-Warning 'The update was published. Windows could not save the worker secret for next time.'
            }
        }
        [Windows.Forms.MessageBox]::Show('The Android Pilot update was published and the Supabase announcement was accepted.', $title, 'OK', 'Information') | Out-Null
    } finally {
        $env:CIRCLE_WORKER_SECRET = $originalSecret
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
