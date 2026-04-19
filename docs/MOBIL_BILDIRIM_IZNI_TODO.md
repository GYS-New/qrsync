# Mobil — Bildirim İzni Raporlama (TODO)

**Hedef:** Kullanıcının cihazındaki bildirim iznini backend'e raporlamak. Web tarafında "bu kullanıcının bildirimi kapalı" uyarısı verilebilsin, gönderici boşa push yollamasın.

**Web + Backend tarafı hazır.** Mobil sadece yeni endpoint'i çağıracak.

---

## 1. Endpoint

```
POST https://<backend>/api/app/bildirim-izni
Content-Type: application/json

{
  "user_id":       "<users.id uuid'si>",
  "device_token":  "<mobil'in register sırasında backend'e gönderdiği device_token değeri>",
  "bildirim_izni": true      // true = izin açık, false = kapalı
}
```

**Response:**
```
200 OK  { "ok": true, "bildirim_izni": true }
400     { "error": "user_id gerekli" | "device_token gerekli" | "bildirim_izni boolean olmalı" }
404     { "error": "Cihaz bulunamadı" }
500     { "error": "<db hatası>" }
```

Auth header gerekmiyor; `user_id + device_token` kombinasyonu doğrulanıyor (mevcut register akışıyla aynı pattern).

---

## 2. Ne zaman çağrılacak?

**Minimum 3 noktada:**

1. **Uygulama açılışında** (her app start / foreground)
   — mevcut durumu oku ve backend'e gönder
2. **Sistem ayarlarından bildirim iznini değiştirip uygulamaya geri dönünce**
   — app foreground'a geldiğinde tekrar oku + gönder (kullanıcı aradaki süre boyunca iOS/Android ayarlarında değiştirmiş olabilir)
3. **İzin isteme akışından sonra** (app ilk kez izin isteyip sonuç alınca)
   — sonucu hemen raporla

---

## 3. Platform-spesifik kod

### React Native (expo-notifications veya react-native-firebase)

```js
import * as Notifications from 'expo-notifications'

async function bildirimIzniRaporla(userId, deviceToken) {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    const izni = status === 'granted'

    await fetch('https://<backend>/api/app/bildirim-izni', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        device_token: deviceToken,
        bildirim_izni: izni,
      }),
    })
  } catch (err) {
    console.warn('bildirim izni raporlanamadı:', err)
  }
}

// App.tsx içinde AppState listener'a ekle:
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    bildirimIzniRaporla(currentUserId, currentDeviceToken)
  }
})

// ve uygulama ilk açıldığında da bir kez çağır
```

### Flutter (firebase_messaging)

```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;

Future<void> bildirimIzniRaporla(String userId, String deviceToken) async {
  final settings = await FirebaseMessaging.instance.getNotificationSettings();
  final izni = settings.authorizationStatus == AuthorizationStatus.authorized ||
               settings.authorizationStatus == AuthorizationStatus.provisional;

  await http.post(
    Uri.parse('https://<backend>/api/app/bildirim-izni'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'user_id': userId,
      'device_token': deviceToken,
      'bildirim_izni': izni,
    }),
  );
}
```

### Native Android (Kotlin)

```kotlin
import androidx.core.app.NotificationManagerCompat

fun bildirimIzniRaporla(context: Context, userId: String, deviceToken: String) {
    val izni = NotificationManagerCompat.from(context).areNotificationsEnabled()
    // HTTP POST ile backend'e gönder
}
```

### Native iOS (Swift)

```swift
import UserNotifications

func bildirimIzniRaporla(userId: String, deviceToken: String) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
        let izni = settings.authorizationStatus == .authorized ||
                   settings.authorizationStatus == .provisional
        // HTTP POST ile backend'e gönder
    }
}
```

---

## 4. Önemli davranış notları

- **device_token değeri** mobil'in backend'e kayıt sırasında gönderdiği token'dır (mevcut `/api/app/register` akışında zaten kullanılan değer). FCM token değil — o farklı bir kolonda (`fcm_token`) tutuluyor.
- **Başarısız olursa sessizce atla.** Bu çağrı "best effort" — hata verse bile app'in normal akışını durdurmamalı.
- Aynı oturumda ara ara bir daha çağrılmasının zararı yok; backend idempotent çalışıyor.
- **NULL durumu:** Bu endpoint hiç çağrılmadıysa backend'de `bildirim_izni = NULL` kalır; web'de "⚠️ İzin Bilinmiyor" olarak görünür. Mobil ilk deploy sonrası ilk açılışta raporlayınca gerçek değer gelir.

---

## 5. Test

1. Cihazda bildirim iznini sistemden kapat
2. App'i aç → `/api/app/bildirim-izni` çağrısı `bildirim_izni=false` ile gider
3. Web → Kullanıcılar sayfasında o cihaz satırında **🔕 Bildirim Kapalı** kırmızı badge görünür
4. Bildirim göndermeye kalkarsan modal'da uyarı çıkar

Bildirim iznini tekrar aç → app'i arka plandan öne getir → `bildirim_izni=true` gider → badge **🔔 Bildirim Açık** yeşile döner.

---

## 6. Sonraki aşamalar (şimdilik yapmıyoruz, ileride isterseniz)

Aynı mantıkla 2 ek doğrulama kademesi daha eklenebilir:

- **Teslim onayı:** FCM handler'dan `POST /api/push/teslim-onay/{logId}` → cihaza ulaştığını belirtir
- **Okundu onayı:** Bildirime tıklayıp app'i açınca `POST /api/push/okundu/{logId}` → kullanıcının gördüğünü belirtir

Bu iki adım için backend'e payload içine `logId` eklenmesi + mobil handler'da branch gerekir. İlerisi için planlandı.

---

**Backend hazır, test edebilirsiniz.** Sorular için → @proje_yetkilisi
