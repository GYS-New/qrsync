// QR-SYNC – Saf TypeScript PDF (A4 Landscape, sifir bagimlılık)

const TR_MAP: Record<string,string> = {
  '\u00c7':'C','\u00e7':'c','\u011e':'G','\u011f':'g','\u0130':'I','\u0131':'i',
  '\u00d6':'O','\u00f6':'o','\u015e':'S','\u015f':'s','\u00dc':'U','\u00fc':'u',
  '\u2013':'-','\u2014':'-','\u2022':'*','\u20ba':'TL',
}
function tr(s:string){return(s??'').split('').map(c=>TR_MAP[c]??c).join('')}
function esc(s:string){return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')}
function safe(s:string){return esc(tr(s))}

type RGB=readonly[number,number,number]
function fill(c:RGB){return`${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} rg`}
function strk(c:RGB){return`${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} RG`}

const C={
  GREEN  :[0.18,0.55,0.18] as RGB, GREEN_L:[0.93,0.97,0.93] as RGB,
  GREEN_D:[0.09,0.19,0.09] as RGB, AMBER  :[0.94,0.73,0.33] as RGB,
  AMBER_L:[1.00,0.98,0.94] as RGB, BLUE   :[0.35,0.54,0.75] as RGB,
  RED    :[0.77,0.32,0.32] as RGB, GRAY   :[0.34,0.40,0.34] as RGB,
  GRAY_L :[0.95,0.96,0.95] as RGB, WHITE  :[1.00,1.00,1.00] as RGB,
  BLACK  :[0.00,0.00,0.00] as RGB, BORDER :[0.82,0.89,0.82] as RGB,
  YELLOW :[0.95,0.94,0.13] as RGB,
}

function rct(x:number,y:number,w:number,h:number,f:RGB,s?:RGB){
  if(w<=0||h<=0)return''
  return s
    ?`${strk(s)}\n0.5 w\n${fill(f)}\n${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re B`
    :`${fill(f)}\n${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`
}
function ln(x1:number,y1:number,x2:number,y2:number,c:RGB,w=0.4){
  return`${strk(c)}\n${w} w\n${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`
}
function txt(s:string,x:number,y:number,sz:number,bold=false,c:RGB=C.BLACK){
  return`${fill(c)}\nBT\n${bold?'/F2':'/F1'} ${sz} Tf\n${x.toFixed(1)} ${y.toFixed(1)} Td\n(${safe(s)}) Tj\nET`
}
function clip(s:string,n:number){const t=tr(s);return t.length<=n?t:t.slice(0,n-1)+'.'}

class Doc{
  private o:string[]=[]
  add(s:string):number{this.o.push(s);return this.o.length}
  patch(id:number,f:string,t:string){this.o[id-1]=this.o[id-1].replace(f,t)}
  build(cat:number):Buffer{
    let p='%PDF-1.4\n'; const off:number[]=[]
    this.o.forEach((o,i)=>{off.push(Buffer.byteLength(p,'latin1'));p+=`${i+1} 0 obj\n${o}\nendobj\n`})
    const x=Buffer.byteLength(p,'latin1')
    p+=`xref\n0 ${this.o.length+1}\n`+'0000000000 65535 f \n'
    off.forEach(o=>{p+=`${String(o).padStart(10,'0')} 00000 n \n`})
    p+=`trailer\n<< /Size ${this.o.length+1} /Root ${cat} 0 R >>\nstartxref\n${x}\n%%EOF`
    return Buffer.from(p,'latin1')
  }
}

export interface GenelRaporPdfData{
  firmaAdi:string; ustLokTanim:string; altLokTanim:string
  raporTarihLabel:string; gunSayisi:number; raporuAlan:string
  toplamGorev:number; toplamTamamlanan:number; toplamSapma:number
  toplamKayip:number; genelBasari:number
  grupMetrikleri:Array<{grup:string;hedef:number;tamamlanan:number;sapma:number;kayip:number;basariOrani:string;genelOran:string}>
  tamamlananGorevler:Array<(string|number)[]>
  sapmaGorevler:Array<(string|number)[]>
}

// A4 Landscape: 842 × 595
const PW=842,PH=595,MG=28,CW=PW-MG*2  // CW=786

export function buildGenelRaporPdfDirect(data:GenelRaporPdfData):Buffer{
  const doc=new Doc()
  const F1=doc.add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>')
  const F2=doc.add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>')
  const FR=`/Font << /F1 ${F1} 0 R /F2 ${F2} 0 R >>`
  const pids:number[]=[]

  function page(ops:string[]){
    const s=ops.filter(Boolean).join('\n')
    const cid=doc.add(`<< /Length ${Buffer.byteLength(s,'latin1')} >>\nstream\n${s}\nendstream`)
    const pid=doc.add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents ${cid} 0 R /Resources << ${FR} >> >>`)
    pids.push(pid)
  }
  function footer(n:number,ops:string[]){
    ops.push(ln(MG,18,PW-MG,18,C.BORDER))
    ops.push(txt(tr(`QR-SYNC  |  ${data.firmaAdi}  |  ${data.raporTarihLabel}`),MG,8,6.5,false,C.GRAY))
    ops.push(txt(`Sayfa ${n}`,PW-MG-50,8,6.5,false,C.GRAY))
  }

  // ══════════════════════════════════════════════════════════════════
  // SAYFA 1: Özet  (Landscape: 842×595)
  // Layout:
  //   - Üst şerit (başlık) : y=PH-MG-30 → yükseklik 30
  //   - İki sütun yan yana:
  //     Sol  (290px) : Parametreler + KPI
  //     Sağ  (466px) : Grup tablosu + Bar grafik
  // ══════════════════════════════════════════════════════════════════
  const p1:string[]=[]

  // ── Başlık şeridi ─────────────────────────────────────────────
  const HDR_H=32
  p1.push(rct(MG,PH-MG-HDR_H,CW,HDR_H,C.GREEN))
  p1.push(txt('QR-SYNC',MG+8,PH-MG-20,16,true,C.WHITE))
  p1.push(txt('GENEL RAPOR',MG+90,PH-MG-20,11,true,C.WHITE))
  p1.push(txt(clip(data.firmaAdi,45),MG+8,PH-MG-30,7.5,false,C.GREEN_L))
  p1.push(txt(clip(data.raporTarihLabel,35),PW-MG-220,PH-MG-20,8,false,C.WHITE))

  const BODY_TOP=PH-MG-HDR_H-6  // y üst sınırı
  const BODY_BOT=MG+26           // footer üstü
  const BODY_H=BODY_TOP-BODY_BOT

  // Sol sütun: 0..290
  const LC=MG, LW=282
  // Sağ sütun: MG+290..CW
  const RC=MG+LW+8, RW=CW-LW-8

  // ── Sol: Parametreler tablosu ─────────────────────────────────
  let y=BODY_TOP
  p1.push(txt('PARAMETRELER',LC,y,7.5,true,C.GREEN)); y-=5
  const PARAMS:[string,string][]=[
    ['Firma',data.firmaAdi],['Ust Lokasyon',data.ustLokTanim||'-'],
    ['Alt Lokasyon',data.altLokTanim||'-'],['Rapor Tarihi',data.raporTarihLabel],
    ['Gun Sayisi',String(data.gunSayisi)],['Raporu Alan',data.raporuAlan||'Yonetim'],
  ]
  const RH=13, LCOL=LW*0.44
  PARAMS.forEach((r,i)=>{
    const ry=y-RH*(i+1)
    p1.push(rct(LC,ry,LW,RH,i%2===0?C.GREEN_L:C.WHITE,C.BORDER))
    p1.push(rct(LC,ry,LCOL,RH,C.GREEN_L))
    p1.push(txt(r[0],LC+3,ry+4,7,true,C.GREEN_D))
    p1.push(txt(clip(r[1],28),LC+LCOL+3,ry+4,7,false,C.BLACK))
  })
  y-=RH*PARAMS.length+8

  // ── Sol: KPI kartları ─────────────────────────────────────────
  p1.push(txt('GENEL ISTATISTIKLER',LC,y,7.5,true,C.GREEN)); y-=5
  const KPIS:[string,string,RGB][]=[
    ['TOPLAM',String(data.toplamGorev),C.BLUE],
    ['TAMAM',String(data.toplamTamamlanan),C.GREEN],
    ['SAPMA',String(data.toplamSapma),C.AMBER],
    ['KAYIP',String(data.toplamKayip),C.RED],
    ['BASARI',`%${data.genelBasari}`,C.GREEN],
  ]
  const KW=LW/5-2,KH=38
  KPIS.forEach((k,i)=>{
    const kx=LC+i*(KW+2.5),ky=y-KH
    p1.push(rct(kx,ky,KW,KH,C.WHITE,k[2]))
    p1.push(rct(kx,ky+KH-4,KW,4,k[2]))
    const vs=k[1],vsz=vs.length>4?13:17
    p1.push(txt(vs,kx+KW/2-vs.length*vsz*0.3,ky+13,vsz,true,k[2]))
    p1.push(txt(k[0],kx+2,ky+3,5.5,false,C.GRAY))
  })
  y-=KH+10

  // ── Sol: Frekans istatistik kutuları ──────────────────────────
  if(y>BODY_BOT+20){
    const STAT_ROWS=[
      ['Toplam Frekans',String(data.toplamGorev)],
      ['Tamamlanan',String(data.toplamTamamlanan)],
      ['Sapma',String(data.toplamSapma)],
      ['Kayip',String(data.toplamKayip)],
      ['Basari Orani',`%${data.genelBasari}`],
    ]
    p1.push(txt('FREKANS OZETI',LC,y,7,true,C.GREEN)); y-=4
    STAT_ROWS.forEach((r,i)=>{
      if(y-11<BODY_BOT)return
      p1.push(rct(LC,y-11,LW,11,i%2===0?C.GRAY_L:C.WHITE,C.BORDER))
      p1.push(txt(r[0],LC+3,y-11+3,7,false,C.BLACK))
      p1.push(txt(r[1],LC+LW-3-r[1].length*7*0.6,y-11+3,7,true,C.GREEN_D))
      y-=11
    })
  }

  // ── Sağ: Grup tablosu ─────────────────────────────────────────
  let ry2=BODY_TOP
  if(data.grupMetrikleri.length>0){
    p1.push(txt('GRUP FREKANS GOSTERGELERI',RC,ry2,7.5,true,C.GREEN)); ry2-=5
    // Sütun genişlikleri: grup adı geniş, diğerleri eşit
    const GC=[0.28,0.10,0.13,0.10,0.10,0.14,0.15].map(f=>RW*f)
    const GH2=['GRUP TANIMI','HEDEF','TAMAMLANAN','SAPMA','KAYIP','BASARI','GENEL ORAN']
    const TH=12
    p1.push(rct(RC,ry2-TH,RW,TH,C.GREEN))
    let cx=RC; GH2.forEach((h,i)=>{p1.push(txt(h,cx+2,ry2-TH+3,6.5,true,C.WHITE));cx+=GC[i]})
    ry2-=TH
    data.grupMetrikleri.forEach((g,ri)=>{
      if(ry2<BODY_BOT+50)return
      p1.push(rct(RC,ry2-TH,RW,TH,ri%2===0?C.GRAY_L:C.WHITE,C.BORDER))
      const vs=[clip(g.grup,24),String(g.hedef),String(g.tamamlanan),String(g.sapma),String(g.kayip),tr(g.basariOrani),tr(g.genelOran)]
      cx=RC; vs.forEach((v,i)=>{
        p1.push(txt(v,cx+2,ry2-TH+3,7,i===0,i===5?C.GREEN:(i===3?C.AMBER:(i===4?C.RED:C.BLACK))))
        cx+=GC[i]
      })
      cx=RC; GC.forEach(w=>{cx+=w;p1.push(ln(cx,ry2,cx,ry2-TH,C.BORDER,0.3))})
      ry2-=TH
    })
    ry2-=8
  }

  // ── Sağ: Bar grafik ───────────────────────────────────────────
  if(data.grupMetrikleri.length>0 && ry2>BODY_BOT+60){
    p1.push(txt('Grup Bazli Frekans Karsilastirmasi (Hedef / Tamamlanan / Sapma / Kayip)',RC,ry2,7,false,C.GRAY))
    ry2-=6
    const CH=ry2-BODY_BOT-10, CX=RC+35, CY=BODY_BOT+8
    const GS=data.grupMetrikleri
    const maxV=Math.max(...GS.flatMap(g=>[g.hedef,g.tamamlanan,g.sapma,g.kayip]),1)
    const sc=CH/maxV
    const STEP=Math.ceil(maxV/4)
    for(let v=0;v<=maxV;v+=STEP){
      const ly=CY+v*sc
      p1.push(ln(CX-2,ly,CX+RW-55,ly,C.BORDER,0.3))
      p1.push(txt(String(v),RC+2,ly-3,5.5,false,C.GRAY))
    }
    p1.push(ln(CX,CY,CX,CY+CH,C.GRAY,0.5))
    p1.push(ln(CX,CY,CX+RW-55,CY,C.GRAY,0.5))
    const BSERIES:[RGB,(g:typeof GS[0])=>number][]=[
      [C.BLUE,g=>g.hedef],[C.GREEN,g=>g.tamamlanan],[C.AMBER,g=>g.sapma],[C.RED,g=>g.kayip]
    ]
    const grpW=(RW-55)/GS.length
    GS.forEach((g,gi)=>{
      const bw=Math.max(2,grpW/5-1), base=CX+gi*grpW+grpW*0.1
      BSERIES.forEach(([color,getter],si)=>{
        const bh=getter(g)*sc
        if(bh>0.5)p1.push(rct(base+si*(bw+0.8),CY,bw,bh,color))
      })
      p1.push(txt(clip(g.grup,9),base,CY-7,5.5,false,C.GRAY))
    })
    // Legend
    const LX=CX+RW-52
    const LNAMES=['Hedef','Tamam','Sapma','Kayip']
    BSERIES.forEach(([color],i)=>{
      const LY=CY+CH-i*11
      p1.push(rct(LX,LY-5,7,7,color))
      p1.push(txt(LNAMES[i],LX+10,LY-4,6,false,C.BLACK))
    })
  }

  footer(1,p1); page(p1)

  // ══════════════════════════════════════════════════════════════════
  // SAYFA 2+: Tamamlanan Frekanslar (Landscape)
  // ══════════════════════════════════════════════════════════════════
  if(data.tamamlananGorevler.length>0){
    const TC=[0.05,0.14,0.16,0.09,0.28,0.14,0.14].map(f=>CW*f)
    const TH3=['SN','PERSONEL','LOKASYON','GOREV NO','GOREV TANIMI','TARIH-SAAT','DURUM']
    const TCLIP=[4,14,15,9,27,13,12]
    const RPP=Math.floor((PH-MG*2-50)/11)
    const ROWS=data.tamamlananGorevler.slice(0,400)
    for(let ci=0;ci<Math.ceil(ROWS.length/RPP);ci++){
      const chunk=ROWS.slice(ci*RPP,(ci+1)*RPP)
      const ops:string[]=[]
      ops.push(txt(`TAMAMLANAN FREKANSLAR  (${data.tamamlananGorevler.length} kayit)`,MG,PH-MG-12,9,true,C.GREEN))
      let ty=PH-MG-24
      ops.push(rct(MG,ty-13,CW,13,C.GREEN))
      let cx=MG; TH3.forEach((h,i)=>{ops.push(txt(h,cx+2,ty-10,6.5,true,C.WHITE));cx+=TC[i]})
      ty-=13
      chunk.forEach((row,ri)=>{
        if(ty-11<MG+22)return
        ops.push(rct(MG,ty-11,CW,11,ri%2===0?C.GRAY_L:C.WHITE,C.BORDER))
        cx=MG; row.forEach((cell,ci2)=>{
          const v=clip(String(cell??''),TCLIP[ci2])
          ops.push(txt(v,cx+2,ty-11+2,7,ci2===6,ci2===6?C.GREEN:C.BLACK))
          cx+=TC[ci2]
        }); ty-=11
      })
      footer(pids.length+1,ops); page(ops)
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Son sayfa: Sapma Frekanslar (Landscape)
  // ══════════════════════════════════════════════════════════════════
  if(data.sapmaGorevler.length>0){
    const SC=[0.05,0.14,0.16,0.09,0.28,0.14,0.14].map(f=>CW*f)
    const SH=['SN','PERSONEL','LOKASYON','GOREV NO','GOREV TANIMI','TARIH-SAAT','SAPMA NEDENI']
    const SCLIP=[4,14,15,9,27,13,12]
    const RPP=Math.floor((PH-MG*2-50)/11)
    const ROWS=data.sapmaGorevler.slice(0,200)
    for(let ci=0;ci<Math.ceil(ROWS.length/RPP);ci++){
      const chunk=ROWS.slice(ci*RPP,(ci+1)*RPP)
      const ops:string[]=[]
      ops.push(txt(`SAPMA FREKANSLAR  (${data.sapmaGorevler.length} kayit)`,MG,PH-MG-12,9,true,C.AMBER))
      let sy=PH-MG-24
      ops.push(rct(MG,sy-13,CW,13,C.AMBER))
      let cx=MG; SH.forEach((h,i)=>{ops.push(txt(h,cx+2,sy-10,6.5,true,C.WHITE));cx+=SC[i]})
      sy-=13
      chunk.forEach((row,ri)=>{
        if(sy-11<MG+22)return
        ops.push(rct(MG,sy-11,CW,11,ri%2===0?C.AMBER_L:C.WHITE,C.BORDER))
        cx=MG; row.forEach((cell,ci2)=>{
          const v=clip(String(cell??''),SCLIP[ci2])
          ops.push(txt(v,cx+2,sy-11+2,7,ci2===6,ci2===6?C.AMBER:C.BLACK))
          cx+=SC[ci2]
        }); sy-=11
      })
      footer(pids.length+1,ops); page(ops)
    }
  }

  const pgId=doc.add(`<< /Type /Pages /Kids [${pids.map(id=>`${id} 0 R`).join(' ')}] /Count ${pids.length} >>`)
  pids.forEach(pid=>doc.patch(pid,'/Parent 0 0 R',`/Parent ${pgId} 0 R`))
  const catId=doc.add(`<< /Type /Catalog /Pages ${pgId} 0 R >>`)
  return doc.build(catId)
}

export function buildSimplePdf(p:{title:string;subtitle?:string;headers:string[];rows:string[][];}):Buffer{
  // ── Tamamen yeni, temiz veri tablosu PDF (A4 Landscape) ──────────
  const doc=new Doc()
  const F1=doc.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const F2=doc.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
  const FR=`/Font << /F1 ${F1} 0 R /F2 ${F2} 0 R >>`
  const pids:number[]=[]

  // A4 Landscape 842x595, margin 24
  const PW=842,PH=595,MG=24,CW=PW-MG*2  // CW=794

  function page(ops:string[]){
    const s=ops.filter(Boolean).join('\n')
    const cid=doc.add(`<< /Length ${Buffer.byteLength(s,'latin1')} >>\nstream\n${s}\nendstream`)
    const pid=doc.add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents ${cid} 0 R /Resources << ${FR} >> >>`)
    pids.push(pid)
  }

  const headers=p.headers
  const rows=p.rows
  const totalRows=rows.length

  // Sütun genişliklerini içeriğe göre hesapla
  const colCount=headers.length
  // Her sütun için max karakter uzunluğunu bul (header dahil)
  const maxLen=headers.map((h,ci)=>{
    const dataMax=rows.reduce((mx,r)=>Math.max(mx,(r[ci]??'').length),0)
    return Math.max(h.length,dataMax,4)
  })
  const totalLen=maxLen.reduce((s,v)=>s+v,0)
  // Orantılı genişlik ata, min 40 max 200
  const colWidths=maxLen.map(len=>Math.min(200,Math.max(40,Math.round((len/totalLen)*CW))))
  // Toplam gerçek genişliği CW'ye normalize et
  const sumW=colWidths.reduce((s,v)=>s+v,0)
  const normWidths=colWidths.map(w=>Math.round(w*(CW/sumW)))
  // Son sütuna kalan pikseli ver
  const sumNorm=normWidths.reduce((s,v)=>s+v,0)
  normWidths[normWidths.length-1]+=CW-sumNorm

  // Sayfa düzeni sabitleri
  const HDR_H=34         // başlık bandı
  const TH=16            // tablo başlık satır yüksekliği
  const RH=13            // veri satır yüksekliği
  const FOOT_H=18        // footer yüksekliği
  const TABLE_TOP=PH-MG-HDR_H-6  // tablo başlangıç y
  const TABLE_BOT=MG+FOOT_H      // tablo bitiş y

  // Bir sayfaya kaç satır sığar
  const rowsPerPage=Math.floor((TABLE_TOP-TH-TABLE_BOT)/RH)

  function hdrBand(ops:string[],pageNum:number,totalPages:number){
    // Yeşil başlık bandı
    ops.push(rct(MG,PH-MG-HDR_H,CW,HDR_H,C.GREEN))
    // Büyük başlık
    ops.push(txt(safe(p.title),MG+10,PH-MG-20,13,true,C.WHITE))
    // Alt başlık (subtitle = satır sayısı vs.)
    const sub=p.subtitle??''
    if(sub) ops.push(txt(safe(sub.slice(0,80)),MG+10,PH-MG-30,7.5,false,C.GREEN_L))
    // Sağ: sayfa no
    const pgStr=`Sayfa ${pageNum} / ${totalPages}  |  ${totalRows} kayit`
    ops.push(txt(pgStr,PW-MG-pgStr.length*5.5-5,PH-MG-20,8,false,C.WHITE))
    // İnce alt çizgi
    ops.push(ln(MG,TABLE_TOP+2,PW-MG,TABLE_TOP+2,C.GREEN_D,0.6))
  }

  function tableHeader(ops:string[],y:number){
    ops.push(rct(MG,y-TH,CW,TH,C.GREEN_D))
    let cx=MG
    headers.forEach((h,i)=>{
      ops.push(txt(clip(tr(h),Math.floor(normWidths[i]/6.5)),cx+4,y-TH+5,7.5,true,C.WHITE))
      if(i<headers.length-1) ops.push(ln(cx+normWidths[i],y,cx+normWidths[i],y-TH,C.GREEN,0.3))
      cx+=normWidths[i]
    })
  }

  function footerBand(ops:string[],pageNum:number){
    ops.push(ln(MG,MG+FOOT_H-2,PW-MG,MG+FOOT_H-2,C.BORDER,0.5))
    const ft=`QR-SYNC  |  Ham Veri Raporu  |  ${p.title}`
    ops.push(txt(safe(ft.slice(0,90)),MG,MG+5,6.5,false,C.GRAY))
  }

  const totalPages=Math.max(1,Math.ceil(rows.length/rowsPerPage))

  for(let pg=0;pg<totalPages;pg++){
    const ops:string[]=[]
    hdrBand(ops,pg+1,totalPages)
    footerBand(ops,pg+1)

    let y=TABLE_TOP
    tableHeader(ops,y)
    y-=TH

    const chunk=rows.slice(pg*rowsPerPage,(pg+1)*rowsPerPage)
    chunk.forEach((row,ri)=>{
      if(y-RH<TABLE_BOT) return
      const bg=ri%2===0?C.GRAY_L:C.WHITE
      ops.push(rct(MG,y-RH,CW,RH,bg,C.BORDER))
      let cx=MG
      row.forEach((cell,ci)=>{
        const maxChars=Math.max(3,Math.floor(normWidths[ci]/6.0))
        const v=clip(String(cell??''),maxChars)
        ops.push(txt(v,cx+4,y-RH+4,7,false,C.BLACK))
        if(ci<row.length-1) ops.push(ln(cx+normWidths[ci],y,cx+normWidths[ci],y-RH,C.BORDER,0.3))
        cx+=normWidths[ci]
      })
      y-=RH
    })

    // Eğer hiç satır yoksa bilgi mesajı
    if(chunk.length===0){
      ops.push(txt('Bu filtreler icin veri bulunamadi.',MG+10,y-20,10,false,C.GRAY))
    }

    page(ops)
  }

  const pgId=doc.add(`<< /Type /Pages /Kids [${pids.map(id=>`${id} 0 R`).join(' ')}] /Count ${pids.length} >>`)
  pids.forEach(pid=>doc.patch(pid,'/Parent 0 0 R',`/Parent ${pgId} 0 R`))
  const catId=doc.add(`<< /Type /Catalog /Pages ${pgId} 0 R >>`)
  return doc.build(catId)
}
