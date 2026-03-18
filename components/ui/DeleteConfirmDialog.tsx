"use client"
import React from "react"

type Props = {
  title?: string
  message?: string
  onSoft: () => Promise<void> | void
  onHard: () => Promise<void> | void
}

export default function DeleteConfirmDialog({
  title = "Silme Onayı",
  message = "Görev nasıl silinsin?",
  onSoft,
  onHard
}: Props) {

  async function softDelete(){
    const ok = confirm("Görev listeden kaldırılacak. Onaylıyor musunuz?")
    if(!ok) return
    await onSoft()
  }

  async function hardDelete(){
    const ok1 = confirm("Görev kalıcı olarak silinecek.")
    if(!ok1) return

    const ok2 = confirm("Bu işlem geri alınamaz. Emin misiniz?")
    if(!ok2) return

    await onHard()
  }

  return (
    <div style={{display:"flex",gap:8}}>
      <button onClick={softDelete}>Listeden kaldır</button>
      <button onClick={hardDelete}>Kalıcı sil</button>
    </div>
  )
}