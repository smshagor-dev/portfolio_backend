const { spawnSync } = require("child_process");

const port = Number.parseInt(process.argv[2], 10);

if (!Number.isInteger(port) || port <= 0) {
  console.error("A valid port is required.");
  process.exit(1);
}

function runPowerShell(command) {
  return spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

const lookup = runPowerShell(
  [
    `$connection = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1;`,
    'if (-not $connection) { exit 0 }',
    '$process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" | Select-Object -First 1;',
    'if (-not $process) { exit 0 }',
    '$commandLine = [string]$process.CommandLine;',
    'Write-Output "$($process.ProcessId)|$commandLine";',
  ].join(" "),
);

const output = String(lookup.stdout || "").trim();
if (!output) {
  process.exit(0);
}

const separatorIndex = output.indexOf("|");
const pid = Number.parseInt(output.slice(0, separatorIndex), 10);
const commandLine = output.slice(separatorIndex + 1);

if (!Number.isInteger(pid) || pid <= 0) {
  process.exit(0);
}

const isPortfolioServer =
  (() => {
    const normalizedCommandLine = String(commandLine || "").toLowerCase().replace(/\\/g, "/");
    const normalizedCwd = String(process.cwd() || "").toLowerCase().replace(/\\/g, "/");
    const backendEntryNames = [`${normalizedCwd}/index.js`, "/backend/index.js"];
    const isBackendIndexProcess =
      /\bnode(\.exe)?["']?\s+index\.js\b/i.test(String(commandLine || "")) ||
      /\bnodemon(\.cmd)?["']?\s+index\.js\b/i.test(String(commandLine || ""));

    return (
      /node(.exe)?/i.test(commandLine) &&
      (isBackendIndexProcess || backendEntryNames.some((entry) => normalizedCommandLine.includes(entry)))
    );
  })();

if (!isPortfolioServer) {
  console.log(`Port ${port} is already in use by another process. Skipping auto-stop.`);
  process.exit(0);
}

const stop = runPowerShell(`Stop-Process -Id ${pid} -Force`);
if (stop.status !== 0) {
  console.error(String(stop.stderr || "").trim() || `Failed to stop process ${pid} on port ${port}.`);
  process.exit(stop.status || 1);
}

console.log(`Stopped stale portfolio server process ${pid} on port ${port}.`);
