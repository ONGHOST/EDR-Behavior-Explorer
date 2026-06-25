<#
.SYNOPSIS
    EDR Behavior Explorer — Windows Sensor Agent

.DESCRIPTION
    Collects live process telemetry from the local Windows machine using
    CIM/WMI and posts it to the behavior engine as structured events.

    Per sample interval it:
      1. Enumerates all running processes (Get-CimInstance Win32_Process)
      2. Reads CPU/Working Set/Private Bytes from corresponding
         Win32_PerfFormattedData_PerfProc_Process objects
      3. Reads file version metadata (CompanyName, FileDescription) from
         the binary's VersionInfo where accessible
      4. Detects new processes since last snapshot (emits process_create)
      5. Detects terminated processes (emits process_terminate)
      6. Emits resource_sample for every surviving process
      7. POSTs the batch to POST /events on the backend

    Runs as a foreground loop; Ctrl-C to stop.
    Best run as Administrator (required for full CommandLine/PrivateBytes access).

.PARAMETER BackendUrl
    Base URL of the behavior engine. Default: http://localhost:8787

.PARAMETER HostId
    Identifier for this machine. Default: $env:COMPUTERNAME

.PARAMETER IntervalSeconds
    Sampling interval. Default: 5

.PARAMETER MaxBatchSize
    Events POSTed in one request. Default: 500

.EXAMPLE
    .\sensor-agent.ps1
    .\sensor-agent.ps1 -BackendUrl http://192.168.1.50:8787 -IntervalSeconds 3

.NOTES
    Requires PowerShell 5.1+ and Windows.
    Run as Administrator for full CommandLine and Private Bytes access.
#>

[CmdletBinding()]
param(
    [string]$BackendUrl      = "http://localhost:8787",
    [string]$HostId          = $env:COMPUTERNAME,
    [int]   $IntervalSeconds = 5,
    [int]   $MaxBatchSize    = 500
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# ─── Helpers ─────────────────────────────────────────────────────────────────

function Get-EpochMs {
    [long]([System.DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
}

function New-EventId {
    [System.Guid]::NewGuid().ToString("N").Substring(0, 16)
}

function Send-Events {
    param([object[]]$Events)
    if (-not $Events -or $Events.Count -eq 0) { return }

    # Batch into chunks of $MaxBatchSize to avoid oversized HTTP bodies
    $offset = 0
    while ($offset -lt $Events.Count) {
        $batch = $Events[$offset..([Math]::Min($offset + $MaxBatchSize - 1, $Events.Count - 1))]
        $body  = $batch | ConvertTo-Json -Depth 8 -Compress

        try {
            $resp = Invoke-RestMethod `
                -Uri          "$BackendUrl/events" `
                -Method       POST `
                -ContentType  "application/json" `
                -Body         $body `
                -ErrorAction  Stop
            Write-Verbose "Posted $($batch.Count) events → accepted $($resp.accepted)"
        }
        catch {
            Write-Warning "POST /events failed: $_"
        }
        $offset += $MaxBatchSize
    }
}

# ─── Version info cache (read once per unique executable path) ───────────────

$VersionInfoCache = @{}

function Get-VersionInfo {
    param([string]$Path)
    if (-not $Path -or $Path -eq "") { return $null }
    if ($VersionInfoCache.ContainsKey($Path)) { return $VersionInfoCache[$Path] }

    try {
        $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
        $info = @{
            companyName = if ($vi.CompanyName)     { $vi.CompanyName.Trim()     } else { $null }
            description = if ($vi.FileDescription) { $vi.FileDescription.Trim() } else { $null }
        }
        $VersionInfoCache[$Path] = $info
        return $info
    }
    catch {
        $VersionInfoCache[$Path] = $null
        return $null
    }
}

# ─── CPU counter (requires two snapshots to calculate delta) ─────────────────
#
# Win32_PerfFormattedData_PerfProc_Process.PercentProcessorTime gives
# CPU% already normalised by the OS counter refresh rate — use it directly.
# It returns values 0-100*<core count>; divide by number of logical processors.

$LogicalCores = (Get-CimInstance -ClassName Win32_ComputerSystem).NumberOfLogicalProcessors

function Get-PerfMap {
    try {
        $perfs = Get-CimInstance -ClassName Win32_PerfFormattedData_PerfProc_Process `
                    -Property Name, IDProcess, PercentProcessorTime, WorkingSet, PrivateBytes `
                    -ErrorAction Stop
        $map = @{}
        foreach ($p in $perfs) {
            if ($p.IDProcess -eq 0 -or $p.IDProcess -eq 4) { continue } # Idle + System
            $map[$p.IDProcess] = $p
        }
        return $map
    }
    catch {
        Write-Warning "Get-CimInstance PerfProc failed: $_"
        return @{}
    }
}

# ─── Main loop ───────────────────────────────────────────────────────────────

Write-Host "EDR Sensor Agent starting" -ForegroundColor Cyan
Write-Host "  Host     : $HostId"
Write-Host "  Backend  : $BackendUrl"
Write-Host "  Interval : $($IntervalSeconds)s"
Write-Host "  Cores    : $LogicalCores"
Write-Host ""
Write-Host "Press Ctrl-C to stop." -ForegroundColor Yellow
Write-Host ""

# pid -> last-seen snapshot (for new/terminated process detection)
$PreviousPids = @{}

while ($true) {
    $cycleStart = Get-Date
    $now        = Get-EpochMs
    $events     = [System.Collections.Generic.List[object]]::new()

    # ── 1. Get all running processes via WMI ─────────────────────────────────
    try {
        $processes = Get-CimInstance `
            -ClassName Win32_Process `
            -Property ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath `
            -ErrorAction Stop
    }
    catch {
        Write-Warning "Get-CimInstance Win32_Process failed: $_"
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }

    # ── 2. Get performance counters ───────────────────────────────────────────
    $perfMap = Get-PerfMap

    # ── 3. Build current PID set and detect changes ───────────────────────────
    $currentPids = @{}

    foreach ($proc in $processes) {
        $procId  = [int]$proc.ProcessId
        $ppid = [int]$proc.ParentProcessId
        if ($procId -eq 0) { continue }  # Idle

        $execPath = if ($proc.ExecutablePath) { $proc.ExecutablePath } else { "" }
        $vi       = Get-VersionInfo -Path $execPath

        $currentPids[$procId] = $true

        # ── resource_sample details ───────────────────────────────────────────
        $perf = $perfMap[$procId]
        $cpu  = 0.0
        $ws   = 0L
        $pb   = 0L

        if ($perf) {
            # PercentProcessorTime is already a %-of-one-core equivalent on Win10+,
            # but can exceed 100 on multi-core for process totals — normalise to 0-100.
            $cpu = [Math]::Round([double]$perf.PercentProcessorTime / $LogicalCores, 2)
            $cpu = [Math]::Max(0, [Math]::Min(100, $cpu))
            $ws  = [long]$perf.WorkingSet
            $pb  = [long]$perf.PrivateBytes
        }

        # ── New process detected ──────────────────────────────────────────────
        if (-not $PreviousPids.ContainsKey($procId)) {
            $createDetails = @{
                executablePath = $execPath
            }
            if ($vi) {
                if ($vi.companyName) { $createDetails["companyName"] = $vi.companyName }
                if ($vi.description) { $createDetails["description"] = $vi.description }
            }
            if ($cpu -gt 0)  { $createDetails["cpuPercent"]        = $cpu }
            if ($ws  -gt 0)  { $createDetails["workingSetBytes"]   = $ws  }
            if ($pb  -gt 0)  { $createDetails["privateBytesBytes"] = $pb  }

            $events.Add(@{
                id          = New-EventId
                hostId      = $HostId
                pid         = $procId
                ppid        = $ppid
                processName = $proc.Name
                commandLine = if ($proc.CommandLine) { $proc.CommandLine } else { $null }
                eventType   = "process_create"
                timestamp   = $now
                details     = $createDetails
            })
        }
        else {
            # ── Existing process — emit resource_sample ───────────────────────
            $sampleDetails = @{
                cpuPercent        = $cpu
                workingSetBytes   = $ws
                privateBytesBytes = $pb
                executablePath    = $execPath
            }
            if ($vi) {
                if ($vi.companyName) { $sampleDetails["companyName"] = $vi.companyName }
                if ($vi.description) { $sampleDetails["description"] = $vi.description }
            }

            $events.Add(@{
                id          = New-EventId
                hostId      = $HostId
                pid         = $procId
                ppid        = $ppid
                processName = $proc.Name
                commandLine = if ($proc.CommandLine) { $proc.CommandLine } else { $null }
                eventType   = "resource_sample"
                timestamp   = $now
                details     = $sampleDetails
            })
        }
    }

    # ── 4. Detect terminated processes ───────────────────────────────────────
    foreach ($oldPid in $PreviousPids.Keys) {
        if (-not $currentPids.ContainsKey($oldPid)) {
            $events.Add(@{
                id          = New-EventId
                hostId      = $HostId
                pid         = $oldPid
                ppid        = 0
                processName = "unknown"
                eventType   = "process_terminate"
                timestamp   = $now
                details     = @{}
            })
        }
    }

    $PreviousPids = $currentPids

    # ── 5. Post to backend ────────────────────────────────────────────────────
    $total = $events.Count
    Write-Host "$(Get-Date -Format 'HH:mm:ss')  $total events ($($currentPids.Count) procs)" -ForegroundColor DarkGray
    Send-Events -Events $events.ToArray()

    # ── 6. Sleep for remainder of interval ───────────────────────────────────
    $elapsed = (Get-Date) - $cycleStart
    $sleep   = $IntervalSeconds - $elapsed.TotalSeconds
    if ($sleep -gt 0) { Start-Sleep -Milliseconds ([int]($sleep * 1000)) }
}
