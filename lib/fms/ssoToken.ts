import { SignJWT } from 'jose'

/**
 * FMS (İO-TEKNİK) için SSO token üretimi.
 *
 * GYS'de kullanıcı FMS modülünü seçince /fms route'u bu token'ı üretip
 * İO-TEKNİK /sso endpoint'ine yönlendirir. İki taraf aynı FMS_SSO_SECRET'i
 * paylaşır (env). HMAC-SHA256 imzalı, 5 dakika geçerli.
 *
 * İO-TEKNİK tarafı: email ile users tablosunda lookup; bulunamazsa default
 * "U" rolünde auto-provision; session cookie set + /dashboard'a yönlendir.
 */

const ALG = 'HS256'
const TTL_SECONDS = 5 * 60 // 5 dakika

export type FmsSsoPayload = {
  email: string
  isim_soyisim: string | null
  gys_user_id: string
  // Müşteri firma_id'sini referans için iletiyoruz; İO-TEKNİK tek-tesis olduğu
  // için doğrudan kullanılmaz ama audit/log için yararlı.
  gys_firma_id: string | null
}

function getSecret(): Uint8Array {
  const raw = process.env.FMS_SSO_SECRET
  if (!raw || raw.length < 32) {
    throw new Error('FMS_SSO_SECRET tanımlı değil veya 32 karakterden kısa')
  }
  return new TextEncoder().encode(raw)
}

export async function ssoTokenUret(payload: FmsSsoPayload): Promise<string> {
  const secret = getSecret()
  const now = Math.floor(Date.now() / 1000)
  return await new SignJWT({
    email: payload.email,
    isim_soyisim: payload.isim_soyisim,
    gys_user_id: payload.gys_user_id,
    gys_firma_id: payload.gys_firma_id,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuer('iogys')
    .setAudience('ioteknik')
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(secret)
}
