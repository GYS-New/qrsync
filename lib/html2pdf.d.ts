declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[]
    filename?: string
    image?: {
      type?: string
      quality?: number
    }
    html2canvas?: {
      scale?: number
    }
    jsPDF?: {
      orientation?: 'portrait' | 'landscape'
      unit?: string
      format?: string
    }
  }

  interface Html2PdfInstance {
    set(options: Html2PdfOptions): Html2PdfInstance
    fromElement(element: HTMLElement): Html2PdfInstance
    fromHtml(html: string | HTMLElement): Html2PdfInstance
    download(filename?: string): Promise<void>
    save(filename?: string): Promise<void>
  }

  function html2pdf(): Html2PdfInstance

  export default html2pdf
}
