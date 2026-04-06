import QRCode from 'qrcode'

export async function generateQRCode(data: string): Promise<string> {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(data, {
      width: 220,
      margin: 2,
      color: {
        dark: '#c45200',
        light: '#ffffff',
      },
    })
    return qrCodeDataURL
  } catch (error) {
    console.error('QR kod oluşturma hatası:', error)
    throw new Error('QR kod oluşturulamadı')
  }
}
