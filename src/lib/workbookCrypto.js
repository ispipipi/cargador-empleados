import { Buffer } from 'buffer';
import process from 'process';

// officecrypto-tool is also usable in browsers, but it expects the Buffer global.
if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}
if (!globalThis.global) {
  globalThis.global = globalThis;
}
if (!globalThis.process) {
  globalThis.process = process;
}

let officeCryptoPromise;

async function loadOfficeCrypto() {
  officeCryptoPromise ??= import('officecrypto-tool').then((module) => module.default ?? module);
  return officeCryptoPromise;
}

export async function isEncryptedWorkbook(arrayBuffer) {
  const officeCrypto = await loadOfficeCrypto();
  return officeCrypto.isEncrypted(arrayBuffer);
}

export async function decryptWorkbook(arrayBuffer, password) {
  let officeCrypto;
  try {
    officeCrypto = await loadOfficeCrypto();
  } catch (error) {
    // A normal workbook does not need the optional crypto chunk. This fallback
    // keeps cached deployments usable while the browser refreshes its assets.
    if (!String(password ?? '').trim()) {
      return arrayBuffer;
    }

    throw createWorkbookPasswordError('UNSUPPORTED_ENCRYPTION', 'No se pudo cargar el lector de archivos protegidos. Recarga la página e inténtalo nuevamente.');
  }

  if (!officeCrypto.isEncrypted(arrayBuffer)) {
    return arrayBuffer;
  }

  const normalizedPassword = String(password ?? '').trim();
  if (!normalizedPassword) {
    throw createWorkbookPasswordError('PASSWORD_REQUIRED', 'Este archivo está protegido y requiere una clave.');
  }

  try {
    const decrypted = await officeCrypto.decrypt(arrayBuffer, { password: normalizedPassword });
    const bytes = decrypted instanceof Uint8Array ? decrypted : new Uint8Array(decrypted);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch (error) {
    if (/password is incorrect/i.test(error?.message ?? '')) {
      throw createWorkbookPasswordError('INVALID_PASSWORD', 'La clave no permite abrir este archivo.');
    }

    throw createWorkbookPasswordError('UNSUPPORTED_ENCRYPTION', 'No se pudo descifrar este tipo de protección de Excel.');
  }
}

function createWorkbookPasswordError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
