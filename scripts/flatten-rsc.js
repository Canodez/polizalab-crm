/**
 * Post-build script: flatten Next.js RSC payload directories into dot-separated files.
 *
 * Next.js 16 static export creates directory structures like:
 *   out/policies/nueva/__next.policies/nueva.txt
 *   out/policies/nueva/__next.policies/nueva/__PAGE__.txt
 *
 * But the client-side router requests them as dot-separated URLs:
 *   /policies/nueva/__next.policies.nueva.txt
 *   /policies/nueva/__next.policies.nueva.__PAGE__.txt
 *
 * This script renames the directory contents to flat dot-separated files
 * so they can be served correctly from S3/CloudFront.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '../out');

function flattenDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('__next.')) {
        flattenNextDir(dir, entry.name, fullPath);
      } else {
        flattenDir(fullPath);
      }
    }
  }
}

function flattenNextDir(parentDir, dirName, dirPath) {
  walkAndFlatten(parentDir, dirName, dirPath);
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function walkAndFlatten(parentDir, prefix, currentDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkAndFlatten(parentDir, prefix + '.' + entry.name, entryPath);
    } else {
      const newName = prefix + '.' + entry.name;
      const newPath = path.join(parentDir, newName);
      fs.renameSync(entryPath, newPath);
    }
  }
}

flattenDir(OUT_DIR);
console.log('RSC payloads flattened.');
