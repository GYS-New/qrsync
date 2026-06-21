import { SignJWT } from 'jose'

/**
 * FMS (İO-TEKNİK) için SSO token üretimi.
 *
 * GYS'de kullanıcı FMS modülünü seçince /fms route'u bu token'ı üretip
 * İO-TEKNİK /api/sso endpoint'ine yönlendirir. İki taraf aynı
 * SSO_GYS_SHARED_SECRET'i paylaşır (env). HMAC-SHA256 imzalı, 5 dk geçerli.
 *
 * Claim sözleşmesi İO-TEKNİK lib/sso.ts ile bire-bir eşleşmeli:
 *   sub  : GYS user UUID
 *   email: kullanıcının e-postası
 *   name : tam adı
 *   iss  : "io-gys"
 *   aud  : "io-teknik"
 */

const ALG = 'HS256'
const TTL_SECONDS = 5 * 60 // 5 dakika
const ISSUER = 'io-gys'
const AUDIENCE = 'io-teknik'

export type FmsSsoPayload = {
  email: string
  isim_soyisim: string | null
  gys_user_id: string
}

function getSecret(): Uint8Array {
  const raw = process.env.SSO_GYS_SHARED_SECRET
  if (!raw || raw.length < 32) {
    throw new Error('SSO_GYS_SHARED_SECRET tanımlı değil veya 32 karakterden kısa')
  }
  return new TextEncoder().encode(raw)
}

export async function ssoTokenUret(payload: FmsSsoPayload): Promise<string> {
  const secret = getSecret()
  const now = Math.floor(Date.now() / 1000)
  return await new SignJWT({
    email: payload.email,
    name: payload.isim_soyisim ?? payload.email,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(payload.gys_user_id)
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(secret)
}
