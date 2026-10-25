import { API_BASE } from './config';

interface ApiError {
  ok?: false;
  error?: string;
  message?: string;
}

const REQUEST_TIMEOUT_MS = 20000;

const b64u = {
  encode(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Uint8Array<ArrayBuffer> {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  let hex = '';
  for (let i = 0; i < d.length; i++) hex += d[i].toString(16).padStart(2, '0');
  return hex;
}

let serverPubPromise: Promise<CryptoKey> | null = null;

function getServerPub(): Promise<CryptoKey> {
  serverPubPromise ??= (async () => {
    const res = await fetch(`${API_BASE}/server-key`, {
      credentials: API_BASE ? 'include' : 'same-origin',
    });
    if (!res.ok) throw { message: '获取服务器公钥失败' } satisfies ApiError;
    const { pub } = await res.json();
    return crypto.subtle.importKey('raw', b64u.decode(pub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  })().catch((e) => {
    serverPubPromise = null;
    throw e;
  });
  return serverPubPromise;
}

let signKeysPromise: Promise<{ privateKey: CryptoKey; pubB64: string }> | null = null;

function getSignKeys() {
  signKeysPromise ??= (async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
    return { privateKey: pair.privateKey, pubB64: b64u.encode(spki) };
  })();
  return signKeysPromise;
}

export async function aetlaApi<T = Record<string, unknown>>(path: string, payload: unknown): Promise<T> {
  const [serverPub, sign] = await Promise.all([getServerPub(), getSignKeys()]);

  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: serverPub },
    eph.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const body = JSON.stringify({
    v: 1,
    ek: b64u.encode(await crypto.subtle.exportKey('raw', eph.publicKey)),
    iv: b64u.encode(iv),
    ct: b64u.encode(ct),
  });

  const ts = String(Date.now());
  const nonce = b64u.encode(crypto.getRandomValues(new Uint8Array(12)));
  const canonical = ['POST', path, ts, nonce, await sha256Hex(body)].join('\n');
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    sign.privateKey,
    new TextEncoder().encode(canonical),
  );

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: 'POST',
      credentials: API_BASE ? 'include' : 'same-origin',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'X-Aetla-Ts': ts,
        'X-Aetla-Nonce': nonce,
        'X-Aetla-Key': sign.pubB64,
        'X-Aetla-Sig': b64u.encode(sig),
      },
      body,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw { error: 'timeout', message: '请求超时，请检查后端是否已启动' } satisfies ApiError;
    }
    throw { error: 'network', message: '网络错误，请确认后端服务已启动' } satisfies ApiError;
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json().catch(() => ({ message: '服务器响应异常' }))) as ApiError & Record<string, unknown>;
  if (!res.ok || data.ok === false) throw data;
  return data as T;
}

export function toast(message: string, dismissible = false): void {
  const snackbar = window.M3eSnackbar;
  if (snackbar?.open) {
    snackbar.open(message, dismissible);
    return;
  }
  alert(message);
}
