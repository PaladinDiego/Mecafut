import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (context.parentURL && (specifier.startsWith('.') || specifier.startsWith('/'))) {
      try {
        const parentPath = fileURLToPath(context.parentURL);
        const parentDir = path.dirname(parentPath);
        for (const ext of ['.js', '.mjs', '.json', '.jsx']) {
          const candidate = path.resolve(parentDir, specifier + ext);
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return nextResolve(pathToFileURL(candidate).href, context);
          }
        }
      } catch (e) {
        // ignore
      }
    }
    throw err;
  }
}
