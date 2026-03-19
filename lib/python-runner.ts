/**
 * lib/python-runner.ts
 * Artık kullanılmıyor — Python bağımlılıkları Node.js'e taşındı.
 * Geriye dönük uyumluluk için boş export bırakıldı.
 */
export function getPythonCmd(): string {
  throw new Error('Python artık kullanılmıyor. Node.js implementasyonunu kullanın.')
}

export function runPythonScript(): Promise<void> {
  return Promise.reject(new Error('Python artık kullanılmıyor.'))
}
