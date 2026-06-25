# EDR Sensor Agent — Windows PowerShell Collector

Runs on your Windows machine. Every `IntervalSeconds` it:
1. Enumerates all running processes via `Win32_Process` (WMI/CIM)
2. Reads CPU %, Working Set, Private Bytes from `Win32_PerfFormattedData_PerfProc_Process`
3. Reads `CompanyName` + `FileDescription` from the binary's VersionInfo
4. Detects new and terminated processes since the last cycle
5. POSTs the batch to `POST /events` on the behavior engine

## Requirements

- Windows 10 / Server 2016+
- PowerShell 5.1+ (built-in) or PowerShell 7+
- **Run as Administrator** — required for full `CommandLine` access and accurate Private Bytes
- Behavior engine backend reachable on `:8787` (or override via `-BackendUrl`)

## Quick start

```powershell
# Allow local scripts (once, in an elevated shell)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# Start collecting — connects to http://localhost:8787 by default
.\sensor-agent.ps1

# Remote backend (e.g. engine running on another machine or a VM)
.\sensor-agent.ps1 -BackendUrl http://192.168.1.10:8787

# Faster sampling (3s) with explicit host name
.\sensor-agent.ps1 -IntervalSeconds 3 -HostId MY-LAPTOP
```

## Parameters

| Parameter | Default | Description |
|---|---|---|
| `-BackendUrl` | `http://localhost:8787` | Base URL of the behavior engine |
| `-HostId` | `$env:COMPUTERNAME` | Host identifier shown in the dashboard |
| `-IntervalSeconds` | `5` | How often to sample, in seconds |
| `-MaxBatchSize` | `500` | Max events per HTTP POST (auto-batches if more) |

## What gets collected

| Field | Source |
|---|---|
| `pid`, `ppid` | `Win32_Process.ProcessId / ParentProcessId` |
| `processName` | `Win32_Process.Name` |
| `commandLine` | `Win32_Process.CommandLine` (requires Admin) |
| `executablePath` | `Win32_Process.ExecutablePath` |
| `companyName` | `FileVersionInfo.CompanyName` (from binary) |
| `description` | `FileVersionInfo.FileDescription` (from binary) |
| `cpuPercent` | `Win32_PerfFormattedData_PerfProc_Process.PercentProcessorTime ÷ cores` |
| `workingSetBytes` | `Win32_PerfFormattedData_PerfProc_Process.WorkingSet` |
| `privateBytesBytes` | `Win32_PerfFormattedData_PerfProc_Process.PrivateBytes` |

## Event types emitted

| Event | When |
|---|---|
| `process_create` | Process seen for first time in a cycle |
| `resource_sample` | Process still running — carries latest CPU/memory |
| `process_terminate` | Process was in previous cycle but not in current |

## Troubleshooting

**"Access denied" / CommandLine is empty**
Run PowerShell as Administrator. System processes (PID 4, services) may still return empty command lines — that's expected.

**"Cannot connect to backend"**
Check the engine is running (`node dist/index.js`) and firewall allows the port. Try `curl http://localhost:8787/audit/verify` from PowerShell to confirm.

**High CPU from the script itself**
The WMI query is synchronous and can take 1–2 s on loaded machines. Increase `-IntervalSeconds` to 10 or 15 to reduce overhead.

**Execution policy error**
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

**"WMI not available"**
Ensure the `winmgmt` service is running:
```powershell
Get-Service winmgmt | Start-Service
```
