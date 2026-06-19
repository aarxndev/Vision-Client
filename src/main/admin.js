const { execFileSync } = require('child_process');

function isWindowsAdmin() {
  if (process.platform !== 'win32') return true;
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function relaunchElevated() {
  const launcher = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const arg = launcher.replace(/'/g, "''");
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Process -FilePath '${arg}' -Verb RunAs`],
    { stdio: 'ignore', windowsHide: true }
  );
}

function ensureAdminElevation({ app, isDev } = {}) {
  if (process.platform !== 'win32' || isDev || !app.isPackaged) return;
  if (isWindowsAdmin()) return;
  try {
    relaunchElevated();
  } catch {
    
  }
  app.exit(0);
}

module.exports = { isWindowsAdmin, ensureAdminElevation };
