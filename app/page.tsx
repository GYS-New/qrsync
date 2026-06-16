import { redirect } from 'next/navigation'

export default function Home() {
  // Dev modunda landing.html'deki hardcoded iogys.com.tr linklerini atlamak
  // için doğrudan login'e git. Production'da pazarlama landing'i gösterilir.
  if (process.env.NODE_ENV === 'development') {
    redirect('/login')
  }
  redirect('/landing.html')
}
