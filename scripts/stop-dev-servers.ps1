# Stops Vite dev servers commonly left running on default ports (Windows).
$ports = 5173, 5174, 5175, 5176, 5177, 8080, 8081
foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $conns) {
    $processId = $conn.OwningProcess
    if ($processId) {
      Write-Host "Stopping process $processId on port $port"
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
}
Write-Host "Done. Run npm run dev from STUCOMMS Booking Portal (or workspace root)."
