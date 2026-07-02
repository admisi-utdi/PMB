# Rencana Migrasi: HTML/JS Statis ke Next.js + TypeScript + Tailwind CSS v3

Dokumen ini berisi rencana langkah demi langkah untuk memindahkan aplikasi pendaftaran mahasiswa baru (PMB UTDI) dari struktur HTML/JS statis saat ini ke framework **Next.js (App Router)** menggunakan **TypeScript** dan **Tailwind CSS v3**, dengan mempertahankan tampilan (UI), animasi, dan logika fungsional yang sama persis, serta meningkatkan performa dan keamanan sesuai standar industri.

---

## 1. Persiapan Tema Tailwind CSS (`tailwind.config.js`) & Aset
Semua warna, font, dan animasi kustom dari `index.html` akan dipetakan ke konfigurasi Tailwind CSS v3:
* **Warna Kustom**:
  * `--navy` & `--teal` -> `navy: '#1E2A44'`
  * `--navy2` & `--teal2` -> `navy-light: '#253352'`
  * `--accent` -> `accent: '#F5B041'`
  * `--accent2` -> `accent-hover: '#e09a2f'`
  * `--muted` -> `muted: '#64748b'`
  * `--border` -> `border: '#E8EDF5'`
* **Animasi & Keyframes**:
  * `blink` (kedipan badge hero)
  * `spin` (loading spinner)
  * `fadeIn` (transisi antar step wizard)
  * `popIn` (animasi modal sukses)
* **Background Pattern & Gambar**:
  * Grid pattern pada hero section (`hero-grid`) harus dipertahankan.
  * Menambahkan `bg1.png` dan `bg2.png` dari folder `public/` sebagai background di bagian-bagian strategis (seperti Hero Section, Footer, atau halaman konfirmasi) **tanpa merusak style asli**. Implementasinya akan ditumpuk dengan *overlay* atau blending CSS (cth: `mix-blend-mode` atau opasitas) sehingga tetap harmonis dengan *feel* orisinal.

---

## 2. Struktur Folder Next.js yang Direkomendasikan
Proyek baru akan diatur dengan struktur berikut:
```text
pmb-nextjs/
├── .env.local                  # Menyimpan NEXT_PUBLIC_API_URL
├── .gitignore                  # Mengabaikan file tidak perlu (node_modules, .next, dll)
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── public/
│   ├── bg1.png                # Background kustom 1
│   └── bg2.png                # Background kustom 2
├── src/
│   ├── types/
│   │   └── pmb.ts             # Interface TypeScript untuk API & State
│   ├── lib/
│   │   ├── api.ts             # Fetching logic dengan error handling & retry
│   │   └── cache.ts           # Logika caching data (localStorage / IndexedDB)
│   ├── app/
│   │   ├── layout.tsx         # Root layout, Google Font loader (Poppins)
│   │   ├── page.tsx           # Halaman utama (landing page)
│   │   └── globals.css        # Tailwind directives & global style
│   ├── context/
│   │   └── PmbContext.tsx     # State management global (pilihan step wizard)
│   ├── hooks/
│   │   ├── usePmbData.ts      # Custom hook untuk fetch & cache data `?action=all`
│   │   └── useDebounce.ts     # Hook debounce untuk pencarian sekolah
│   └── components/
│       ├── Navbar.tsx         # Navigasi sticky & scroll anchor
│       ├── HeroSection.tsx    # Banner utama & status gelombang (dengan bg1.png/bg2.png)
│       ├── ImageSlider.tsx    # Carousel foto kegiatan
│       ├── InfoSections.tsx   # Panel info Skema, Prodi, dan Jalur
│       ├── WizardSection.tsx  # Wizard pendaftaran (Step 0 - Step 5)
│       ├── CostEstimator.tsx  # Kalkulator estimasi biaya interaktif (Cek Biaya)
│       ├── InfoCards.tsx      # Info Cara Pembayaran & Beasiswa
│       └── Footer.tsx
```

---

## 3. Standarisasi Fetching & Performa (Mengatasi Masalah Codebase Lama)
Pada versi HTML lama (index.html), ditemukan beberapa isu performa kritis seperti: tidak ada caching, tidak ada timeout, aplikasi terblokir sepenuhnya saat initial load (`?action=all`), dan *merge conflict marker* di kode JS.

**Strategi Next.js:**
1. **Caching Client-Side:** Data referensi (config, prodi, jalur, biaya) yang diambil dari `?action=all` harus di-cache di `localStorage` atau via **React Query/SWR**. Render halaman segera dengan data *stale*, dan validasi ulang (revalidate) di background agar tidak memblokir render (menghindari cold start 3-8 detik dari Apps Script).
2. **Timeout & Retry:** Implementasikan `AbortController` dengan timeout (misal 15-30 detik) di *setiap* fungsi fetch (termasuk fetch initial data, pencarian NPSN, & pengiriman OTP). Jika gagal, berikan tombol retry (tanpa me-reload seluruh halaman) atau mekanisme *exponential backoff*.
3. **Data Fetching Splitting (Opsional):** Jika ukuran JSON hasil dari `?action=all` terlalu besar, data statis berukuran masif (contoh: daftar `prov_kab`, `jurusan_sma`) dapat dipecah (*lazy load*) dan hanya dipanggil saat masuk ke Step 5 Wizard Pendaftaran.
4. **Debouncing API:** Implementasi debounce hook (`useDebounce`) dengan jeda ~400ms saat *user* mengetik di kolom pencarian sekolah. Pencarian yang sama harus dikembalikan dari cache *in-memory* alih-alih me-request API ulang.
5. **Request Headers:** Tambahkan header `Content-Type: application/json` pada request POST (submit OTP & daftar) yang sebelumnya hilang.
6. **Double-Submit Prevention:** Gunakan boolean state (`isSubmitting`) untuk mematikan *button* dan mencegah pengiriman data ganda.

---

## 4. Struktur Tipe TypeScript (`src/types/pmb.ts`)
Membuat tipe data ketat untuk menghindari error *runtime* yang sebelumnya tertutup oleh JavaScript longgar:
* `Gelombang`: Menyimpan status gelombang aktif dan besaran potongan SPA.
* `Skema`: Pilihan cara belajar (Reguler, Karyawan, RPL).
* `Jalur`: Syarat dan skema jalur masuk.
* `Prodi`: Informasi program studi dan biaya SPP.
* `SelectionState`: State (`sel`) untuk menyimpan pilihan pengguna (Gelombang, Skema, Jalur, Prodi, dan RPL subtipe).

---

## 5. Tahapan Migrasi

### Tahap 1: Inisialisasi Proyek, Tailwind & Integrasi Aset
1. Menjalankan setup awal Next.js (`create-next-app`) dengan TypeScript dan Tailwind CSS v3.
2. Mengonfigurasi `tailwind.config.js` dengan palet warna spesifik UTDI.
3. Memindahkan font Google Poppins ke `next/font/google` di `layout.tsx` untuk optimasi.
4. Mengintegrasikan `bg1.png` dan `bg2.png` ke struktur UI secara non-destruktif (sebagai *background layer* dengan *opacity* / CSS blending pada Hero atau section besar tertentu) agar estetika warna kustom `--navy` dan ornamen lainnya tidak tertutupi.

### Tahap 2: Manajemen State & Optimasi API Fetching
1. Pindahkan URL API yang sebelumnya di-hardcode (`var API_URL = 'https://script.google.com/macros/s/...'`) ke dalam file `.env.local` sebagai variabel environment (misalnya `NEXT_PUBLIC_API_URL`) untuk alasan keamanan dan fleksibilitas *deployment*.
2. Buat `src/lib/api.ts` dengan fungsi fetch wrapper yang mendukung `AbortController`, timeout, dan header POST standar yang mengambil URL dari `process.env.NEXT_PUBLIC_API_URL`.
3. Buat custom hook `usePmbData` (atau gunakan SWR/React Query) untuk menarik endpoint `?action=all`. Set implementasi cache di localStorage agar saat di-refresh, halaman langsung dirender tanpa menunggu *cold start* dari server AppScript.
4. Buat `PmbContext.tsx` untuk membungkus `SelectionState` (wizard progress) dan membagikannya ke komponen child.

### Tahap 3: Pembuatan Komponen UI & Translasi CSS
1. Ekstrak bagian HTML (dari `index.html` lama yang berisi 2839 baris) menjadi komponen reaktif (mis. `HeroSection.tsx`, `WizardSection.tsx`).
2. Tulis ulang CSS khusus menjadi utility-classes Tailwind (cth: `.gel-status-card` -> `bg-white/5 border border-white/10 rounded-[20px] p-6 backdrop-blur-md`).
3. Selesaikan bug/reduksi fungsi ganda seperti `initSlider()` dan hapus duplikasi fungsi dari kode *legacy*.
4. Perbaiki *merge conflict markers* (seperti `<<<<<<< Updated upstream`) yang ditemukan di dalam `submitDaftar()` *legacy*.

### Tahap 4: Logika Form & OTP Verification (Langkah 6 Wizard)
1. Gunakan React State (`useState` / `useForm`) untuk mengontrol seluruh isian form, memastikan validasi form sinkron dan aman sebelum pengiriman.
2. Integrasikan integrasi OTP WA (`action=kirim_otp_wa` & `action=verif_otp`) dengan timer mundur (`setInterval`) via state.
3. Gunakan custom hook *debounce* di kolom pencarian sekolah dan simpan cache hasil pencarian (Map) secara lokal.

### Tahap 5: Pengujian Akhir
1. Sesuaikan Playwright / Cypress e2e tests (`tests/pmb-daftar.spec.js`) untuk URL Next.js (`http://localhost:3000`).
2. Uji seluruh skenario: Pemuatan tanpa cache (first load), *fallback error*, perhitungan estimasi biaya otomatis, bypass OTP via test suite, hingga submit form bebas error.
