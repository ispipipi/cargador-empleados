import { Buffer } from 'buffer';
import officeCryptoModule from 'officecrypto-tool';
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

function loadOfficeCrypto() {
  return officeCryptoModule.default ?? officeCryptoModule;
}

export async function isEncryptedWorkbook(arrayBuffer) {
  const officeCrypto = await loadOfficeCrypto();
  return officeCrypto.isEncrypted(arrayBuffer);
}

export async function decryptWorkbook(arrayBuffer, password) {
  if (!(await isEncryptedWorkbook(arrayBuffer))) {
    return arrayBuffer;
  }

  const normalizedPassword = String(password ?? '').trim();
  if (!normalizedPassword) {
    throw createWorkbookPasswordError('PASSWORD_REQUIRED', 'Este archivo está protegido y requiere una clave.');
  }

  try {
    const officeCrypto = await loadOfficeCrypto();
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
