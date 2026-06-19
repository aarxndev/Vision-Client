const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const product = context.packager.appInfo.productFilename;
  const exe = path.join(context.appOutDir, `${product}.exe`);
  if (!fs.existsSync(exe)) {
    console.warn('afterPack: exe not found, skipping admin manifest:', exe);
    return;
  }

  const { rcedit } = await import('rcedit');
  await rcedit(exe, { 'request-execution-level': 'requireAdministrator' });
  console.log('Admin manifest embedded (afterPack):', exe);
};
