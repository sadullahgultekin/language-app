// Minimal Web Push / VAPID implementation for Cloudflare Workers (Web Crypto API)

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), c => c.charCodeAt(0));
}

function b64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function importPrivateKey(pkcs8B64url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    b64urlDecode(pkcs8B64url),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function makeVAPIDJWT(audience: string, publicKeyB64url: string, privateKeyB64url: string): Promise<string> {
  const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 3600,
    sub: 'mailto:notifications@language-app.local',
  })));
  const signingInput = `${header}.${payload}`;
  const key = await importPrivateKey(privateKeyB64url);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64urlEncode(sig)}`;
}

// Encrypt payload using Web Push content encryption (RFC 8291, ECDH + AES-GCM)
async function encryptPayload(
  payload: string,
  p256dhB64url: string,
  authB64url: string
): Promise<{ body: Uint8Array; salt: string; serverPublicKey: string }> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Server ephemeral key pair
  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  const serverPublicKeyRaw = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey);

  // Client public key
  const clientPublicKey = await crypto.subtle.importKey(
    'raw', b64urlDecode(p256dhB64url),
    { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );

  const authSecret = b64urlDecode(authB64url);

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeyPair.privateKey, 256
  );

  // HKDF extract + expand (RFC 8291)
  const prk = await crypto.subtle.importKey('raw', sharedBits, { name: 'HKDF' }, false, ['deriveBits']);

  const clientPublicKeyRaw = b64urlDecode(p256dhB64url);
  const serverPublicKeyRawBytes = new Uint8Array(serverPublicKeyRaw);

  // keyinfo = "WebPush: info\0" + clientPub + serverPub
  const keyInfo = new Uint8Array([
    ...enc.encode('WebPush: info\0'),
    ...clientPublicKeyRaw,
    ...serverPublicKeyRawBytes,
  ]);

  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: keyInfo },
    prk, 256
  );

  const ikmKey = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);

  const cekInfo = enc.encode('Content-Encoding: aes128gcm\0');
  const nonceInfo = enc.encode('Content-Encoding: nonce\0');

  const cekBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: cekInfo }, ikmKey, 128);
  const nonceBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, ikmKey, 96);

  const cek = await crypto.subtle.importKey('raw', cekBits, { name: 'AES-GCM' }, false, ['encrypt']);
  const nonce = new Uint8Array(nonceBits);

  // Padding: 1 byte delimiter (0x02) + payload
  const plaintext = new Uint8Array([...enc.encode(payload), 0x02]);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, plaintext);

  // Build aes128gcm content-encoding header (RFC 8188)
  // salt(16) + rs(4, big-endian) + idlen(1) + serverPublicKey(65)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + serverPublicKeyRawBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = serverPublicKeyRawBytes.length;
  header.set(serverPublicKeyRawBytes, 21);

  const body = new Uint8Array(header.length + ciphertext.byteLength);
  body.set(header, 0);
  body.set(new Uint8Array(ciphertext), header.length);

  return { body, salt: b64urlEncode(salt), serverPublicKey: b64urlEncode(serverPublicKeyRaw) };
}

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendPushNotification(
  sub: PushSubscription,
  payload: { title: string; body: string; url?: string },
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ ok: boolean; status: number }> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const jwt = await makeVAPIDJWT(audience, vapidPublicKey, vapidPrivateKey);
  const { body } = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body,
  });

  return { ok: res.ok, status: res.status };
}
