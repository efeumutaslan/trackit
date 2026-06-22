# TrackIt — Native Mobile Architecture (iOS + Android)

> Tek satırlık özet: TrackIt'i sıfırdan **native iOS (Swift/SwiftUI)** ve **native Android (Kotlin/Compose)** olarak, **tam offline-first**, **çok kullanıcılı**, **aylık abonelikle (RevenueCat)** monetize edilen global bir uygulamaya dönüştürmek için kütüphane/mimari/akış planı. Önce iOS, sonra Android.

Bu doküman 4 bölüm:
1. **Mevcut uygulamanın analizi** — her sayfa, özellik, etkileşim (mobile'a taşınacak miras)
2. **Ortak omurga** — backend, sync, premium gating (iki platformda da aynı)
3. **iOS mimarisi** (detaylı — ilk lansman)
4. **Android mimarisi**
5. **Geliştirme akışı** (macOS + Windows + Claude) ve yol haritası

---

## 1. Mevcut Uygulamanın Analizi

Mevcut TrackIt ~9.000 satırlık olgun bir PWA: **React/Vite + Express + better-sqlite3 + Docker/Caddy** (Oracle Free Tier). Mobile-first tasarlandığı için mobile'a taşınması doğal. 11 tablo, token-tabanlı auth, tek sunucu.

### 1.1 Sayfa ve işlev envanteri

| Sayfa | İşlev | Mobile'da kritik etkileşimler |
|---|---|---|
| **Home** | Aylık takvim (template renkleriyle), yıllık ısı haritası (heatmap), son antrenmanlar | Takvim hücresine dokunma, ay değiştirme (yatay swipe doğal olur), gün rozetleri (çoklu antrenman) |
| **Sessions (liste)** | Geçmiş antrenmanlar listesi | **Sola kaydır → sil**, satıra dokun → detay |
| **Session (detay)** | Set/tekrar/kg girişi, A/B alternatif egzersiz, dinlenme zamanlayıcısı, ▲▼ ağırlık ayar göstergesi (neon kart tint), egzersiz + antrenman notları, tonaj (önceki karşılaştırma), superset etiketleri, ruh hali (mood), başla/bitir zamanlayıcı (3 mod), accordion aç/kapa, hedef tekrar/süre/mesafe | +/− bumper'lar, accordion uzun liste, swipe-to-delete set, zamanlayıcı, haptik geri bildirim noktaları |
| **Templates** | Şablon listesi/grid, düzenleme, renkler, klonlama, çoğaltma | Sola kaydır → sil (masaüstünde buton), kart grid'i |
| **TemplateEdit** | Şablon egzersizleri, hedefler, A/B alt egzersiz, superset, dinlenme | Egzersiz ekle/sırala/kaldır, renk seçici |
| **Exercises** | Egzersiz listesi, gruplar, strength/cardio türü, ilerleme grafiği | Sola kaydır → sil, tür ikonu (dumbbell/koşu) |
| **ExerciseEdit** | İsim, tür (strength/cardio segmented), grup, notlar, ilerleme | Segmented control, tür seçimi |
| **Bodyweight** | Kilo kaydı + not, dürüst çizgi/alan trend grafiği | Tarih seçici, swipe-to-delete kayıt |
| **Settings** | Tema (System/Light/Dark), 6 özellik toggle, ağırlık artışı, tekrar placeholder, dinlenme zamanlayıcısı, session timer start + ⓘ, CSV içe/dışa aktar, tüm cihazlardan çıkış | iOS-tarzı toggle'lar, segmented control'ler, info popover |

### 1.2 Veri modeli (11 tablo)

`users`, `sessions_auth`, `exercises` (kind: strength/cardio, group_id), `templates` (color), `template_exercises` (alt_exercise_id, target_sets/reps/time/mileage, superset_tag, rest_seconds), `workout_sessions` (started_at, finished_at, workout_notes, mood, created_at), `session_exercises` (weight_adjust ▲▼, exercise_notes, prev_*), `session_sets` (weight_kg, reps_done, time_s, mileage_m), `exercise_groups`, `bodyweight`, `user_settings` (tema + 6 feature flag + weight_increment + rep_placeholder_mode + session_timer_start).

Bu şema neredeyse birebir Postgres'e taşınabilir → sync omurgasının temeli.

### 1.3 Etkileşim DNA'sı (mobile'da korunacak ruh)

Mevcut uygulamanın "hissi" şunlardan geliyor ve native'de **daha da iyileştirilecek**:
- **Swipe-to-delete** (zaten var) → native'de sistem-standart kaydırma + haptik
- **Accordion** egzersiz kartları → native'de yumuşak spring animasyon
- **Segmented control'ler, iOS-tarzı toggle'lar** → native'de gerçek `UISegmentedControl`/`Switch`, `SegmentedButton`/`Switch`
- **Neon tint, info popover, renk seçici** → native sheet/popover
- **+/− bumper'lar** → uzun basınca hızlanan (press-and-hold repeat) + haptik tick
- **Native tarih/saat seçici** (mevcutta locale sorunları vardı; native'de sıfır sorun)

> **Eksik olan ve native'de eklenecek:** haptik geri bildirim (henüz yok), uzun-basma menüleri, gerçek pull-to-refresh, paylaşım sheet'i, widget'lar, App Store/Play yaşam döngüsü.

---

## 2. Ortak Omurga (iki platform da aynı)

Native iki ayrı kod tabanı yazılacak **ama** ikisi de aynı backend, aynı sync motoru, aynı premium mantığına bağlanacak. Bu katman tek "gerçeğin kaynağı".

### 2.1 Backend: Supabase

**Öneri: Supabase** (yönetilen Postgres + Auth + Row-Level Security + Storage + Edge Functions).

Neden Supabase (kendi Express/SQLite'ı büyütmek yerine):
- **Çok kullanıcılı auth hazır gelir** (e-posta/şifre, Apple ile giriş, Google ile giriş) — App Store "Sign in with Apple" zorunluluğunu karşılar.
- **Postgres**, mevcut SQLite şemana neredeyse birebir uyuyor — migration kolay.
- **Row-Level Security (RLS):** her satır `user_id`'ye kilitlenir, kullanıcılar yalnızca kendi verisini görür. Çok kullanıcılı güvenliğin temeli, sunucu kodu yazmadan.
- **Offline-first sync için PowerSync ile resmi entegrasyon** (aşağıda).
- **Ücretsiz katman** cömert; ölçeklenince ödersin. Gerekirse **self-host** edilebilir (senin Oracle Free Tier + Docker tecrüben buna uygun).
- **Edge Functions** (Deno/TypeScript): RevenueCat webhook'unu dinleyip premium durumunu Postgres'e yazmak için.

Alternatifler ve neden değil:
- **Firebase/Firestore:** NoSQL, mevcut ilişkisel şemaya uymuyor; SQL sorguların (tonaj, ilerleme) zorlaşır.
- **Kendi Express/SQLite'ı büyütmek:** offline sync, çok-cihaz, ölçek, auth'u sıfırdan yazmak gerekir — solo geliştirici için aylar.
- **Convex/InstantDB:** modern ama Postgres/SQL esnekliğini ve RevenueCat entegrasyon olgunluğunu kaybedersin.

### 2.2 Offline-first sync: PowerSync

**Öneri: PowerSync** — Postgres ↔ local SQLite çift yönlü sync motoru. Senin "salonda internet yokken her şey çalışsın, sonra sync olsun" gereksinimini birebir çözer.

Nasıl çalışır:
1. Uygulama **her zaman local SQLite'a** okuyup yazar (anında, internet olmadan).
2. PowerSync arka planda Postgres ile çift yönlü senkronize eder.
3. Çevrimdışıyken yapılan değişiklikler kuyruğa girer, bağlantı gelince yüklenir (PostgREST üzerinden).
4. RLS yazma izinlerini, "sync rules" hangi satırların indirileceğini kontrol eder.
5. Çakışmalar (conflict) son-yazan-kazanır + özel mantıkla çözülür.

**Kritik bulgu (2026):** PowerSync'in artık **native Swift ve Kotlin SDK'ları var** (2023'te roadmap'teydi, şimdi production). Yani React Native'e mahkum değiliz — gerçek native + gerçek offline sync. PowerSync Cloud'un ücretsiz katmanı var, self-host edilebilir.

> **Not (operasyon):** Supabase logical replication'da boşta kalan instance'larda WAL büyümesi sorunu için `max_wal_size` ve `max_slot_wal_keep_size` küçültülmeli (hobi/pet projelerde önerilen ayar). Bu, dokümante edilmiş bir kurulum adımı.

**Offline'ın premium olması burada nasıl çözülür:** Mimari her zaman offline-first (bu sadece iyi mühendislik). "Tam offline" bir *ürün özelliği* olarak entitlement ile kapılanır — örn. ücretsiz kullanıcı PowerSync sync penceresi/geçmişi sınırlı (son 10 kayıt + aktif session), premium kullanıcı tam offline geçmiş + sınırsız. Bu, sync rules + entitlement bayrağıyla ayarlanır (kod değişmeden).

### 2.3 Premium & feature gating: RevenueCat + uzaktan ayarlanabilir limitler

**Öneri: RevenueCat** (senin seçimin — en kolay entegrasyon). RevenueCat, StoreKit 2 (iOS) ve Google Play Billing'i (Android) sarmalar; makbuz doğrulama, abonelik durumu, çapraz-platform senkron, analitik, **sunucu-güdümlü paywall**'u üstlenir.

Çekirdek kavram — **entitlement'lar**: Kodun ürün ID'sini değil, mantıksal erişim seviyesini kontrol eder. Örn. tek entitlement: `premium`. App Store/Play'deki aylık/yıllık ürünleri bu entitlement'a bağlarsın; kod sadece `premium aktif mi?` sorar.

```swift
// iOS örneği
let info = try await Purchases.shared.customerInfo()
let isPremium = info.entitlements["premium"]?.isActive == true
```

```kotlin
// Android örneği
val info = Purchases.sharedInstance.awaitCustomerInfo()
val isPremium = info.entitlements["premium"]?.isActive == true
```

**Limitleri "kolayca değiştirme" gereksinimi — kritik mimari:** Limit sayıları (geçmiş=10, template sınırı, exercise sınırı) **asla koda gömülmez**. Bunun yerine **uzaktan yapılandırma** katmanı:

| Limit | Free (varsayılan) | Premium |
|---|---|---|
| Görünür antrenman geçmişi | **10** | Sınırsız |
| Template oluşturma | **N (örn. 3)** | Sınırsız |
| Exercise sayısı | **M (örn. 20)** | Sınırsız |
| Tam offline | Kısıtlı | Tam |
| Cihaz senkronu | **Var** (ücretsizde) | Var |

Bu sayıları değiştirmenin **iki yolu** (ikisini de kuracağız, biri yedek):
1. **Supabase'de bir `app_config` tablosu** (key/value JSON): `{"free_history_limit": 10, "free_template_limit": 3, "free_exercise_limit": 20}`. Uygulama açılışta çeker, local'e cache'ler. Değiştirmek = tabloda bir satır güncellemek (app güncellemesi YOK).
2. **RevenueCat "offerings" + metadata** veya **Firebase Remote Config** (alternatif). RevenueCat'in sunucu-güdümlü yapısı paywall'u da app güncellemeden değiştirmeni sağlar.

> Önerilen birincil yol: **Supabase `app_config` tablosu** (zaten Supabase var, ekstra servis yok). Böylece tek bir SQL UPDATE ile `free_history_limit`'i 10'dan 15'e çekebilirsin.

Gating mimarisi (her iki platformda aynı desen):
```
EntitlementManager (RevenueCat'i sarmalar)
   ├─ isPremium: Bool/Boolean  (canlı, reactive)
   └─ limits: AppLimits        (app_config'ten, premium ise ∞)

FeatureGate.canCreateTemplate(currentCount) -> Bool
FeatureGate.visibleHistoryLimit() -> Int   (free:10 / premium:∞)
```
UI bu kapıyı sorgular; limit aşılırsa paywall sheet açılır.

### 2.4 Ortak veri akışı (özet diyagram)

```
   ┌─────────────── iOS (Swift) ───────────────┐   ┌──────────── Android (Kotlin) ────────────┐
   │  SwiftUI  →  ViewModel  →  Repository      │   │  Compose  →  ViewModel  →  Repository     │
   │                              │             │   │                            │             │
   │                       local SQLite (GRDB/  │   │                     local SQLite (Room/  │
   │                       PowerSync SDK)       │   │                     PowerSync SDK)       │
   └──────────────────────────────┬────────────┘   └────────────────────────────┬─────────────┘
                                   │  PowerSync (çift yönlü sync)                 │
                                   └──────────────────┬──────────────────────────┘
                                                      ▼
                                         ┌───────────────────────────┐
                                         │   Supabase (Postgres)      │
                                         │   Auth · RLS · app_config  │
                                         │   Edge Function (webhook)  │
                                         └─────────────┬─────────────┘
                                                       ▲
                                          RevenueCat webhook (premium durumu)
                                                       │
                                         ┌─────────────┴─────────────┐
                                         │  RevenueCat (StoreKit2 /   │
                                         │  Play Billing sarmalar)    │
                                         └───────────────────────────┘
```

---

## 3. iOS Mimarisi (ilk lansman — detaylı)

### 3.1 Tech stack

| Katman | Seçim | Sürüm/Not (2026) |
|---|---|---|
| Dil | **Swift 6** | Strict concurrency |
| Min OS | **iOS 17+** | SwiftData/modern API'ler için; pazarın ~%90+'ı |
| UI | **SwiftUI** (ana), gerektiğinde UIKit köprüsü | Deklaratif, native his |
| Mimari | **MV + observable** (basit ekranlar) / **TCA — The Composable Architecture v1.13+** (karmaşık session ekranı) | Aşağıda açıklama |
| Local DB | **GRDB.swift** (+ SharingGRDB) | SQL-merkezli, FTS5 arama, SQLCipher şifreleme |
| Sync | **PowerSync Swift SDK** | local SQLite ↔ Supabase Postgres |
| Auth | **Supabase Swift SDK** + **Sign in with Apple** | Asimetrik JWT, PowerSync ile uyumlu |
| Premium | **RevenueCat purchases-ios** + RevenueCatUI (paywall) | StoreKit 2 sarmalar |
| Grafik | **Swift Charts** (Apple) | Bodyweight trend, ilerleme |
| Haptik | **CoreHaptics** + `UIImpactFeedbackGenerator` | bumper tick, swipe, başarı |
| Bağımlılık yönetimi | **Swift Package Manager** | |
| Test | **XCTest** + **Swift Testing** | |

**Mimari kararı — neden hibrit (MV + TCA):**
- Basit ekranlar (Settings, Templates listesi, Bodyweight) için **MV pattern** (SwiftUI `@Observable` ViewModel) yeterli — az boilerplate.
- **Session detay ekranı** uygulamanın en karmaşık parçası (set/A-B/timer/adjust/notlar, çok sayıda yan etki). Burada **TCA** (Redux-benzeri tek yönlü akış) test edilebilirlik ve durum yönetimi kazandırır. TCA v1.13 olgun.
- **GRDB neden SwiftData değil:** Mevcut uygulaman SQL-merkezli (tonaj hesapları, ilerleme sorguları, FTS arama potansiyeli). GRDB tam SQL kontrolü + **SQLCipher şifreleme** (kullanıcı sağlık verisi) + **FTS5** verir; SwiftData bunları henüz vermiyor. PowerSync zaten SQLite tabanlı → GRDB ile doğal uyum. (SharingGRDB, GRDB'yi SwiftUI'da SwiftData kadar ergonomik yapar.)

### 3.2 Proje yapısı

```
TrackIt-iOS/
├─ App/                      # @main, App lifecycle, DI kökü
├─ Core/
│  ├─ Database/              # GRDB kurulumu, PowerSync bağlama, migrasyonlar
│  ├─ Sync/                  # PowerSync yapılandırma, connector
│  ├─ Auth/                  # Supabase auth, Sign in with Apple
│  ├─ Entitlements/          # RevenueCat sarmalayıcı, FeatureGate, AppLimits
│  └─ DesignSystem/          # Renkler (neon #D3FF56), tipografi, haptikler, bileşenler
├─ Features/
│  ├─ Home/                  # takvim + heatmap + son antrenmanlar
│  ├─ Sessions/              # liste + detay (TCA), set/A-B/timer
│  ├─ Templates/             # liste + düzenleme
│  ├─ Exercises/             # roster + gruplar + ilerleme
│  ├─ Bodyweight/            # log + Swift Charts trend
│  ├─ Settings/              # tema, toggle'lar, CSV
│  └─ Paywall/               # RevenueCatUI paywall + gating ekranları
├─ Models/                   # GRDB Record tipleri (Exercise, Template, Session...)
└─ Resources/                # Assets, Localizable (TR/EN), App Icon
```

### 3.3 Veri katmanı akışı

```
View (SwiftUI)
  → ViewModel / TCA Store
    → Repository (protokol)
      → GRDB DatabaseQueue (local SQLite — anında okuma/yazma)
         ↕ PowerSync (arka planda Postgres ile sync)
```
- UI **her zaman** local DB'den okur (GRDB `ValueObservation` ile reactive — DB değişince UI otomatik güncellenir).
- Yazma → local'e anında → PowerSync kuyruğa alır → bağlantı gelince Supabase'e.
- Çevrimdışı tamamen sorunsuz (salon senaryosu).

### 3.4 Premium gating (iOS)

```swift
@Observable final class EntitlementManager {
    private(set) var isPremium = false
    private(set) var limits = AppLimits.free   // app_config'ten yüklenir

    func refresh() async {
        let info = try? await Purchases.shared.customerInfo()
        isPremium = info?.entitlements["premium"]?.isActive == true
        limits = isPremium ? .unlimited : await AppConfig.fetchFreeLimits()
    }
}

enum FeatureGate {
    static func canCreateTemplate(count: Int, ent: EntitlementManager) -> Bool {
        ent.isPremium || count < ent.limits.templateLimit
    }
    static func visibleHistory(ent: EntitlementManager) -> Int {
        ent.isPremium ? .max : ent.limits.historyLimit   // free: 10
    }
}
```
Limit aşılınca → `PaywallView` (RevenueCatUI sunucu-güdümlü) sheet olarak açılır.

### 3.5 Mikro-etkileşim & haptik kataloğu (iOS)

| Etkileşim | Native uygulama |
|---|---|
| +/− ağırlık bumper | Dokunuşta `.impact(.light)`; uzun basınca hızlanan tekrar |
| Swipe-to-delete | `.swipeActions` (sistem standart) + silmede `.impact(.medium)` |
| Set tamamlama / PR (kişisel rekor) | `.notification(.success)` haptik + Swift Charts'ta vurgulama |
| Accordion aç/kapa | Spring animasyon (`.spring(response:0.35)`) |
| Dinlenme zamanlayıcısı bitti | `CoreHaptics` özel pattern + opsiyonel ses |
| ▲▼ ağırlık ayar | Seçimde `.selection` haptik, neon tint korunur |
| Pull-to-refresh | `.refreshable` |
| Uzun-basma menü | `.contextMenu` (egzersiz/template hızlı eylemler) |

### 3.6 iOS ekstra fırsatlar (premium veya cila)
- **WidgetKit** (ana ekran widget'ı: bugünkü antrenman, haftalık tonaj)
- **Live Activities** (aktif session/dinlenme zamanlayıcısı kilit ekranında)
- **App Shortcuts / Siri** ("Bugünkü antrenmanı başlat")
- **HealthKit** (kilo, antrenman senkronu — premium)
- **iCloud yedek** (zaten PowerSync sync var; ek güvence)

---

## 4. Android Mimarisi

### 4.1 Tech stack

| Katman | Seçim | Sürüm/Not (2026) |
|---|---|---|
| Dil | **Kotlin** | Coroutines + Flow |
| Min SDK | **API 26 (Android 8)** | Modern API'ler, pazarın büyük çoğunluğu |
| UI | **Jetpack Compose** | Deklaratif, native his |
| Mimari | **MVI** (Model-View-Intent) + **Clean Architecture** | Tek yönlü akış; Compose ile en uyumlu |
| Local DB | **Room** (SQLite) | Coroutines/Flow ile reactive, single source of truth |
| Sync | **PowerSync Kotlin SDK** | local SQLite ↔ Supabase Postgres |
| Auth | **Supabase Kotlin SDK** + **Sign in with Google / Credential Manager** | |
| Premium | **RevenueCat purchases-android** + Paywalls | Play Billing sarmalar |
| DI | **Hilt** | (Koin alternatif; Hilt standart) |
| Annotation işleme | **KSP** (Kapt değil) | 2x hızlı build |
| Navigasyon | **Compose Navigation 2** | (Navigation 3 yükselişte, opsiyonel) |
| Ağ (gerekirse) | **Retrofit + Kotlinx Serialization** | Çoğu şeyi PowerSync hallediyor |
| Key-value | **DataStore** | Tema, ayar tercihleri |
| Arka plan sync | **WorkManager** | Periyodik sync güvencesi |
| Grafik | **Compose** tabanlı chart (Vico veya custom Canvas) | Bodyweight/ilerleme |
| Haptik | **HapticFeedback** (Compose) + `VibrationEffect` | |
| Build | **Gradle Kotlin DSL + Version Catalogs**, multi-module | |
| Test | **JUnit4 + MockK + Compose UI test** | |

**Mimari kararı — neden MVI:** Compose tamamen reaktif; tek `UiState` nesnesi tüm ekranı sürer. MVI'nin tek yönlü akışı (Intent → ViewModel → yeni immutable State → recomposition) session ekranının karmaşık durumunu öngörülebilir/test edilebilir kılar. (MVVM Google'ın varsayılanı ama MVI fully-reactive Compose app'lerde daha popüler.)

### 4.2 Proje yapısı (multi-module)

```
TrackIt-Android/
├─ app/                      # uygulama girişi, navigasyon, DI kökü
├─ core/
│  ├─ database/              # Room + PowerSync entegrasyonu, entity'ler, DAO'lar
│  ├─ sync/                  # PowerSync connector
│  ├─ auth/                  # Supabase auth, Google ile giriş
│  ├─ entitlements/          # RevenueCat sarmalayıcı, FeatureGate, AppLimits
│  ├─ designsystem/          # Material3 tema, neon renk, haptik, bileşenler
│  └─ common/                # Result, hata, ortak util
├─ feature/
│  ├─ home/                  # takvim + heatmap
│  ├─ sessions/              # liste + detay (MVI)
│  ├─ templates/
│  ├─ exercises/
│  ├─ bodyweight/
│  ├─ settings/
│  └─ paywall/               # RevenueCat paywall
└─ build-logic/              # Gradle convention plugin'ler
```

### 4.3 Veri katmanı akışı

```
Composable
  → ViewModel (StateFlow<UiState>)  ← MVI Intent'ler
    → UseCase (saf Kotlin)
      → Repository
        → Room DAO (Flow — reactive, single source of truth)
           ↕ PowerSync (arka planda Postgres ile sync)
```
- Room `Flow` → Compose'a otomatik akar; DB değişince UI yenilenir, manuel refresh yok.
- Yazma local'e anında; PowerSync + WorkManager senkronu garanti eder.

### 4.4 Premium gating (Android)

```kotlin
class EntitlementManager(private val appConfig: AppConfig) {
    private val _state = MutableStateFlow(EntitlementState.free())
    val state: StateFlow<EntitlementState> = _state

    suspend fun refresh() {
        val info = Purchases.sharedInstance.awaitCustomerInfo()
        val premium = info.entitlements["premium"]?.isActive == true
        _state.value = EntitlementState(
            isPremium = premium,
            limits = if (premium) AppLimits.UNLIMITED else appConfig.fetchFreeLimits()
        )
    }
}

object FeatureGate {
    fun canCreateTemplate(count: Int, s: EntitlementState) =
        s.isPremium || count < s.limits.templateLimit
    fun visibleHistory(s: EntitlementState) =
        if (s.isPremium) Int.MAX_VALUE else s.limits.historyLimit  // free: 10
}
```

### 4.5 Mikro-etkileşim & haptik kataloğu (Android)
- +/− bumper: `HapticFeedbackType.LongPress`/`TextHandleMove` + uzun-basma repeat
- Swipe-to-delete: `SwipeToDismissBox` (Material3) + `VibrationEffect`
- PR/başarı: özel `VibrationEffect` pattern + Compose vurgulama
- Accordion: `animateContentSize()` + spring
- Dinlenme bitti: `VibrationEffect.createWaveform` + opsiyonel ses
- Pull-to-refresh: `PullToRefreshBox` (Material3)
- Uzun-basma menü: `ModalBottomSheet` / `DropdownMenu`

### 4.6 Android ekstra fırsatlar
- **App Widget** (Glance API — bugünkü antrenman/tonaj)
- **Quick Settings tile** / **Wear OS** companion (ileride)
- **Health Connect** entegrasyonu (kilo/antrenman — premium)

---

## 5. Geliştirme Akışı, Migration ve Yol Haritası

### 5.1 macOS + Windows + Claude ile geliştirme

| Görev | macOS | Windows |
|---|---|---|
| **iOS (Swift/SwiftUI)** | ✅ Xcode 26.3 (entegre Claude agent desteği var) + Claude Code | ❌ (iOS build için Mac şart — sadece Mac'te) |
| **Android (Kotlin/Compose)** | ✅ Android Studio + Claude Code | ✅ Android Studio + Claude Code |
| **Backend (Supabase, Edge Functions)** | ✅ | ✅ (platformdan bağımsız) |

Pratik öneri: **iOS işini Mac'te yap** (zaten önce iOS lansmanı). **Android'i** her iki makinede de yapabilirsin. **Backend/Supabase** her yerde. Xcode 26.3'ün entegre Claude agent'ı + Claude Code, native Swift/Kotlin üretiminde sana asistanlık eder.

### 5.2 Migration stratejisi (mevcut PWA → mobile)

1. **Şemayı taşı:** SQLite 11 tablo → Supabase Postgres. Neredeyse birebir; `user_id` + RLS politikaları ekle.
2. **CSV köprüsü:** Mevcut uygulamanın CSV dışa aktarımı zaten var → erken kullanıcılar verisini taşıyabilir; ayrıca demo verisi üretir.
3. **Design system'i çıkar:** Neon `#D3FF56`, koyu `#0A0A0A`, mevcut tema değişkenleri → iOS `Color`/Android `Material3` token'larına.
4. **PWA'yı koru:** Mobile çıkana kadar PWA canlı kalır (mevcut kullanıcılar etkilenmez).

### 5.3 Önerilen yol haritası (önce iOS)

**Faz 0 — Omurga (1 hafta):** Supabase projesi, şema + RLS, PowerSync bağlama, `app_config` tablosu, RevenueCat hesabı + entitlement `premium` + test ürünleri.

**Faz 1 — iOS MVP:** Auth (Sign in with Apple) → GRDB + PowerSync → Home/Sessions/Session(temel)/Templates/Exercises/Bodyweight/Settings → offline-first çalışır.

**Faz 2 — iOS premium & cila:** RevenueCat paywall, FeatureGate (geçmiş=10/template/exercise limitleri app_config'ten), haptikler, animasyonlar, Swift Charts, widget'lar.

**Faz 3 — iOS App Store lansmanı:** Sandbox abonelik testi, App Review notları, "Sign in with Apple" + gizlilik etiketleri.

**Faz 4 — Android:** Aynı backend'e Compose + Room + PowerSync + MVI ile ikinci istemci; iOS'taki tüm kararlar tekrar kullanılır.

**Faz 5 — Play Store lansmanı.**

### 5.4 Maliyet/operasyon notları
- Supabase ücretsiz katman → büyüyünce öde; gerekirse self-host (Oracle).
- PowerSync Cloud ücretsiz katman → self-host opsiyonu.
- RevenueCat belirli MRR'a kadar ücretsiz.
- App Store: $99/yıl, Play: $25 tek sefer geliştirici hesabı.
- Apple %15–30, Google %15–30 komisyon (RevenueCat üstüne küçük pay; küçük ölçekte ücretsiz).

---

## Özet karar tablosu

| Konu | Karar |
|---|---|
| iOS UI / mimari | SwiftUI + (MV / TCA hibrit) |
| iOS local DB | GRDB.swift (+SharingGRDB), SQLCipher, FTS5 |
| Android UI / mimari | Jetpack Compose + MVI + Clean Architecture |
| Android local DB | Room |
| Sync | **PowerSync** (native Swift + Kotlin SDK), çift yönlü offline-first |
| Backend | **Supabase** (Postgres + Auth + RLS + Edge Functions) |
| Premium | **RevenueCat** (entitlement: `premium`) |
| Limitler (10 geçmiş / template / exercise) | Supabase **`app_config`** tablosu — SQL UPDATE ile anında değişir, app güncellemesi yok |
| Lansman | Önce iOS (Mac), sonra Android |

> Bu mimari "sadece spor uygulaması" değil; offline-first veri katmanı + reaktif UI + haptik/mikro-etkileşim + sunucu-ayarlanabilir gating, herhangi bir ciddi tüketici uygulamasının iskeleti. TrackIt'in mevcut özellik olgunluğu (A/B alternatif, tonaj, timer modları, tema, feature flag'ler) bu iskelete doğrudan oturuyor.
