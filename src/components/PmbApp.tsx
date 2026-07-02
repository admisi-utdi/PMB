'use client';

import { useEffect, useRef, useState } from 'react';
import { postPmbAction, searchSchools } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { usePmbData } from '@/hooks/usePmbData';
import type {
  ApiResult,
  Beasiswa,
  Biaya,
  Cicilan,
  Gelombang,
  Jalur,
  Mitra,
  PmbData,
  Prodi,
  RplSubtipe,
  SchoolSearchResult,
  SelectionState,
  Skema,
} from '@/types/pmb';

const INITIAL_SELECTION: SelectionState = {
  gel: null,
  skema: null,
  mitra: null,
  jalur: null,
  prodi: null,
};

const INITIAL_FORM = {
  nama: '',
  nik: '',
  ttl: '',
  tgl: '',
  jk: '',
  agama: '',
  wa: '',
  email: '',
  alamat: '',
  rt: '',
  rw: '',
  desa: '',
  kecamatan: '',
  provinsi: '',
  kota: '',
  nisn: '',
  cariSekolah: '',
  npsn: '',
  namaSekolah: '',
  npsnHidden: '',
  namaSekolahHidden: '',
  jurusanSekolah: '',
  referral: '',
  otpWa: '',
};

type FormState = typeof INITIAL_FORM;

function valueToString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function valueToNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function truthy(value: unknown): boolean {
  return value === true || value === 'TRUE' || value === 'true' || value === 1 || value === '1';
}

function cfg(data: PmbData | null, key: string, fallback = ''): string {
  return valueToString(data?.config?.[key], fallback);
}

function txt(data: PmbData | null, key: string, fallback = ''): string {
  return valueToString(data?.teks_ui?.[key], fallback);
}

function fmt(value: unknown): string {
  const n = valueToNumber(value, 0);
  return n <= 0 ? '—' : `Rp ${n.toLocaleString('id-ID')}`;
}

function parseDateInt(dateString?: string): number {
  if (!dateString) return 0;
  const parts = String(dateString).split('T')[0].split(' ')[0].split('-');
  if (parts.length !== 3) return 0;
  return Number(parts[0]) * 10000 + Number(parts[1]) * 100 + Number(parts[2]);
}

function todayInt(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function isGelombangAktif(gelombang: Gelombang): boolean {
  const today = todayInt();
  return today >= parseDateInt(gelombang.tanggal_mulai) && today <= parseDateInt(gelombang.tanggal_selesai);
}

function formatTanggal(dateString?: string): string {
  if (!dateString) return '';
  const parts = String(dateString).split('T')[0].split(' ')[0].split('-');
  if (parts.length !== 3) return dateString;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return dateString;
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function getActiveGelombang(data: PmbData | null): Gelombang | null {
  const list = data?.gelombang ?? [];
  return list.find(isGelombangAktif) ?? list.find((gel) => todayInt() < parseDateInt(gel.tanggal_selesai)) ?? list[0] ?? null;
}

function getGelData(data: PmbData | null, sel: SelectionState): Gelombang | null {
  if (!data?.gelombang?.length) return null;
  const current = data.gelombang.find((gel) => String(gel.id) === String(sel.gel));
  return current ?? getActiveGelombang(data);
}

function getProdiData(data: PmbData | null, prodiId: string | null): Prodi | null {
  if (!data?.prodi?.length || !prodiId) return null;
  return data.prodi.find((prodi) => prodi.id === prodiId) ?? null;
}

function getJalurData(data: PmbData | null, jalurId?: string): Jalur | null {
  if (!data?.jalur?.length || !jalurId) return null;
  return data.jalur.find((jalur) => jalur.id === jalurId) ?? null;
}

function getBiayaData(data: PmbData | null, sel: SelectionState): Biaya | null {
  const gel = getGelData(data, sel);
  if (!data?.biaya_spa || !sel.prodi || !gel) return null;
  return data.biaya_spa[sel.prodi]?.[String(gel.id)] ?? data.biaya_spa[sel.prodi]?.K ?? data.biaya_spa[sel.prodi]?.['1'] ?? null;
}

function getCicilanDP(data: PmbData | null): number {
  return valueToNumber(data?.cicilan?.[0]?.persen_bayar, 35);
}

function labelWaktuCicilan(cicilan: Cicilan): string {
  const fixedDate = valueToString(cicilan.tanggal_tetap).trim();
  if (fixedDate && fixedDate !== '0' && fixedDate !== 'false' && fixedDate !== 'null') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(fixedDate)) return formatTanggal(fixedDate);
    return fixedDate;
  }

  const days = valueToNumber(cicilan.batas_hari_sejak_daftar, 0);
  return days > 0 ? `H+${days} sejak pendaftaran` : 'Saat pendaftaran';
}

function isJalurAvailableForSkema(jalur: Jalur, skema: Skema | null): boolean {
  if (!skema) return true;
  const available = valueToString(jalur.tersedia_di).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!available.length) return false;
  const skemaId = skema.id.toLowerCase();
  const skemaName = skema.nama.toLowerCase();
  const firstWord = skemaName.split(' ')[0];

  return available.some((item) => (
    item === skemaId
    || item === skemaName
    || item.includes(skemaId)
    || item.includes(firstWord)
    || skemaName.includes(item)
  ));
}

function hasKolomKaryawan(data: PmbData | null): boolean {
  return Boolean(data?.prodi?.some((prodi) => prodi.tersedia_karyawan !== undefined && prodi.tersedia_karyawan !== ''));
}

function hasKolomRpl(data: PmbData | null): boolean {
  return Boolean(data?.prodi?.some((prodi) => prodi.tersedia_rpl !== undefined && prodi.tersedia_rpl !== ''));
}

function calculateCost(data: PmbData | null, sel: SelectionState) {
  const biaya = getBiayaData(data, sel);
  const jalurData = getJalurData(data, sel.jalur?.id);
  const spaNorm = valueToNumber(biaya?.spa_normal, 0);
  const spaAfter = valueToNumber(biaya?.spa_setelah_potongan, 0);
  const sppBase = valueToNumber(biaya?.spp_tetap, 0);
  const sksBase = valueToNumber(biaya?.spp_per_sks, 0);
  const anvBase = valueToNumber(biaya?.aanvullen, 0);

  const overrideSPA = jalurData ? valueToNumber(jalurData.override_spa, -1) : -1;
  const overrideSPP = jalurData ? valueToNumber(jalurData.override_spp, -1) : -1;
  const overrideSKS = jalurData ? valueToNumber(jalurData.override_sks, -1) : -1;

  let spaFinal = overrideSPA >= 0 ? overrideSPA : spaAfter;
  let sppFinal = overrideSPP >= 0 ? overrideSPP : sppBase;
  let sksFinal = overrideSKS >= 0 ? overrideSKS : sksBase;
  let anvFinal = anvBase;
  let isSppBulanan = false;
  let catatan = valueToString(jalurData?.catatan_biaya_jalur);

  if (sel.jalur?.sppPerBulan && sel.jalur.sppPerBulan > 0 && !sel.jalur.rplSubtipe) {
    sppFinal = sel.jalur.sppPerBulan;
    spaFinal = overrideSPA >= 0 ? overrideSPA : spaFinal;
    isSppBulanan = true;
  }

  if (sel.jalur?.rplSubtipe?.data) {
    const rpl = sel.jalur.rplSubtipe.data;
    sppFinal = valueToNumber(rpl.spp_per_bulan, sppFinal);
    anvFinal = valueToNumber(rpl.aanvullen_per_sks, anvFinal);
    spaFinal = 0;
    isSppBulanan = true;
    catatan = valueToString(rpl.catatan_biaya, catatan);
  }

  if (overrideSKS >= 0) sksFinal = overrideSKS;

  return {
    spaNorm,
    spaAfter,
    spaFinal,
    potongan: Math.max(spaNorm - spaAfter, 0),
    sppFinal,
    sksFinal,
    anvFinal,
    isSppBulanan,
    biayaKemahasiswaan: valueToNumber(jalurData?.biaya_kemahasiswaan, 0),
    catatan,
  };
}

function normalizeWa(phone: string): string {
  let normalized = phone.replace(/[\s-]/g, '');
  if (normalized.startsWith('0')) normalized = `62${normalized.slice(1)}`;
  if (normalized.startsWith('+62')) normalized = normalized.slice(1);
  if (normalized.startsWith('8')) normalized = `62${normalized}`;
  return normalized;
}

function goTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.pageYOffset - 80;
  window.scrollTo({ top, behavior: 'smooth' });
}

function CardIcon({ iconUrl, emoji, fallback = '📌', color = 'var(--navy)' }: { iconUrl?: string; emoji?: string; fallback?: string; color?: string }) {
  const cleanUrl = valueToString(iconUrl).replace(/[\s\r\n\t]/g, '').trim();
  return (
    <div className="card-icon" style={{ background: color }}>
      {cleanUrl.startsWith('http') || cleanUrl.startsWith('//') ? (
        <img src={cleanUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
      ) : (
        <span>{valueToString(emoji, fallback)}</span>
      )}
    </div>
  );
}

export function PmbApp() {
  const { data, error, isLoading, isValidating, retry } = usePmbData();
  const [currentStep, setCurrentStep] = useState(0);
  const [sel, setSel] = useState<SelectionState>(INITIAL_SELECTION);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [manualSekolah, setManualSekolah] = useState(false);
  const [schoolResults, setSchoolResults] = useState<SchoolSearchResult[]>([]);
  const [showSchoolResults, setShowSchoolResults] = useState(false);
  const [verifWa, setVerifWa] = useState(false);
  const [showWaOtp, setShowWaOtp] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpChecking, setOtpChecking] = useState(false);
  const [waStatus, setWaStatus] = useState('');
  const [waCooldown, setWaCooldown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('Pendaftaran Terkirim!');
  const [modalBody, setModalBody] = useState('');
  const [modalCountdown, setModalCountdown] = useState('');
  const schoolCache = useRef(new Map<string, SchoolSearchResult[]>());
  const debouncedSchoolQuery = useDebounce(form.cariSekolah, 400);

  const activeGel = getActiveGelombang(data);
  const currentGel = getGelData(data, sel);
  const currentSkema = data?.skema?.find((item) => item.id === sel.skema?.id) ?? null;
  const currentProdi = getProdiData(data, sel.prodi);
  const cost = calculateCost(data, sel);
  const dpPct = getCicilanDP(data) / 100;
  const bayarAwal = Math.round(cost.spaFinal * dpPct) + cost.sppFinal;
  const waEnabled = data?.verif_config ? truthy(data.verif_config.wa_enabled) : true;

  useEffect(() => {
    if (activeGel && sel.gel === null) {
      setSel((prev) => ({ ...prev, gel: activeGel.id }));
    }
  }, [activeGel, sel.gel]);

  useEffect(() => {
    if (!data?.verif_config || !truthy(data.verif_config.wa_enabled)) {
      setVerifWa(true);
    }
  }, [data?.verif_config]);

  useEffect(() => {
    if (waCooldown <= 0) return;
    const timer = window.setTimeout(() => setWaCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [waCooldown]);

  useEffect(() => {
    const query = debouncedSchoolQuery.trim();
    if (query.length < 3) {
      setShowSchoolResults(false);
      setSchoolResults([]);
      return;
    }

    const cached = schoolCache.current.get(query.toLowerCase());
    if (cached) {
      setSchoolResults(cached);
      setShowSchoolResults(true);
      return;
    }

    let alive = true;
    searchSchools(query)
      .then((results) => {
        if (!alive) return;
        schoolCache.current.set(query.toLowerCase(), results);
        setSchoolResults(results);
        setShowSchoolResults(true);
      })
      .catch(() => {
        if (!alive) return;
        setShowSchoolResults(false);
      });

    return () => {
      alive = false;
    };
  }, [debouncedSchoolQuery]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function nextStep(step: number) {
    setCurrentStep(step);
    window.setTimeout(() => goTo('pendaftaran'), 0);
  }

  function prevStep(step: number) {
    setCurrentStep(step);
    window.setTimeout(() => goTo('pendaftaran'), 0);
  }

  function availableJalur(): Jalur[] {
    const list = data?.jalur ?? [];
    if (!currentSkema) return list;
    return list.filter((jalur) => isJalurAvailableForSkema(jalur, currentSkema));
  }

  function availableProdi(): Prodi[] {
    let list = data?.prodi ?? [];

    if (sel.mitra?.data?.prodi_tersedia) {
      const allowed = sel.mitra.data.prodi_tersedia.split(',').map((item) => item.trim()).filter(Boolean);
      list = list.filter((prodi) => allowed.includes(prodi.id));
    }

    if (sel.jalur?.isKaryawan) {
      list = list.filter((prodi) => (hasKolomKaryawan(data) ? truthy(prodi.tersedia_karyawan) : ['IF', 'SI'].includes(prodi.id)));
    }

    if (sel.jalur?.id === 'rpl') {
      list = list.filter((prodi) => (hasKolomRpl(data) ? truthy(prodi.tersedia_rpl) : ['IF', 'SI', 'TK', 'BD'].includes(prodi.id)));
    }

    return list;
  }

  function pilihSkema(skema: Skema) {
    setSel((prev) => ({ ...prev, skema: { id: skema.id, nama: skema.nama }, mitra: null, jalur: null, prodi: null }));
  }

  function pilihMitra(mitra: Mitra) {
    setSel((prev) => ({ ...prev, mitra: { id: mitra.id, nama: mitra.nama, data: mitra }, jalur: null, prodi: null }));
  }

  function pilihJalur(jalur: Jalur) {
    setSel((prev) => ({
      ...prev,
      jalur: {
        id: jalur.id,
        nama: jalur.nama,
        isKIPK: truthy(jalur.is_kipk),
        isKaryawan: jalur.id === 'karyawan',
        sppPerBulan: valueToNumber(jalur.spp_per_bulan, 0),
        rplSubtipe: null,
      },
      prodi: null,
    }));
  }

  function pilihRplSubtipe(rpl: RplSubtipe) {
    setSel((prev) => ({
      ...prev,
      jalur: prev.jalur ? {
        ...prev.jalur,
        rplSubtipe: { id: rpl.id, nama: rpl.nama, data: rpl },
        sppPerBulan: valueToNumber(rpl.spp_per_bulan, 0),
        aanvulenPerSks: valueToNumber(rpl.aanvullen_per_sks, 0),
      } : prev.jalur,
      prodi: null,
    }));
  }

  function pilihProdi(prodiId: string) {
    setSel((prev) => ({ ...prev, prodi: prodiId }));
  }

  function selectSchool(school: SchoolSearchResult) {
    setForm((prev) => ({
      ...prev,
      npsnHidden: school.npsn,
      namaSekolahHidden: school.nama_sekolah,
      cariSekolah: school.nama_sekolah,
      npsn: '',
      namaSekolah: '',
    }));
    setManualSekolah(false);
    setShowSchoolResults(false);
  }

  function toggleManualSekolah() {
    const next = !manualSekolah;
    setManualSekolah(next);
    if (next) {
      setForm((prev) => ({ ...prev, npsnHidden: '', namaSekolahHidden: '' }));
      setShowSchoolResults(false);
    }
  }

  function resetVerifWa(value: string) {
    setForm((prev) => ({ ...prev, wa: value }));
    setVerifWa(!waEnabled);
    setShowWaOtp(false);
    setWaStatus('');
  }

  async function kirimOtpWa() {
    const target = normalizeWa(form.wa);
    if (!/^628[0-9]{8,11}$/.test(target)) {
      window.alert('Nomor WhatsApp tidak valid.\nFormat: 628xxxxxxxxx atau 08xxxxxxxxx');
      return;
    }

    setOtpSending(true);
    setShowWaOtp(true);
    setWaStatus('Mengirim kode...');
    setField('wa', target);

    try {
      const res = await postPmbAction<ApiResult>({ action: 'kirim_otp_wa', phone: target }, 15000);
      if (res.success || res.skipped) {
        if (res.skipped) {
          setVerifWa(true);
          setWaStatus('Berhasil diverifikasi.');
        } else {
          setWaCooldown(30);
          setWaStatus('Kode dikirim ke WhatsApp. Masukkan kode di bawah.');
        }
      } else {
        window.alert(res.error || 'Gagal mengirim kode. Coba lagi.');
      }
    } catch {
      window.alert('Gagal terhubung ke server.');
    } finally {
      setOtpSending(false);
    }
  }

  async function verifikasiOtpWa() {
    const token = form.otpWa.trim().toUpperCase();
    if (token.length < 6) {
      window.alert('Masukkan kode 6 karakter.');
      return;
    }

    setOtpChecking(true);
    try {
      const res = await postPmbAction<ApiResult>({ action: 'verif_otp', target: normalizeWa(form.wa), tipe: 'wa', token }, 15000);
      if (res.valid) {
        setVerifWa(true);
        setWaStatus('Berhasil!');
      } else {
        setWaStatus(res.error || 'Kode tidak valid.');
      }
    } catch {
      setWaStatus('Gagal terhubung.');
    } finally {
      setOtpChecking(false);
    }
  }

  function validateSubmit(): string[] {
    const missing: string[] = [];
    const npsn = form.npsnHidden || form.npsn;
    const namaSekolah = form.namaSekolahHidden || form.namaSekolah;
    if (!form.nama) missing.push('Nama Lengkap');
    if (!form.nik) missing.push('NIK');
    if (!form.ttl) missing.push('Tempat Lahir');
    if (!form.tgl) missing.push('Tanggal Lahir');
    if (!form.jk) missing.push('Jenis Kelamin');
    if (!form.agama) missing.push('Agama');
    if (!form.wa) missing.push('Nomor WhatsApp');
    if (!form.alamat) missing.push('Alamat Jalan');
    if (!form.provinsi) missing.push('Provinsi');
    if (!form.kota) missing.push('Kota/Kabupaten');
    if (!namaSekolah) missing.push('Nama Sekolah');
    if (!npsn) missing.push('NPSN');
    if (!form.jurusanSekolah) missing.push('Jurusan Sekolah');
    return missing;
  }

  async function submitDaftar() {
    if (isSubmitting) return;
    if (waEnabled && !verifWa) {
      window.alert('WhatsApp belum diverifikasi. Kirim dan masukkan kode OTP terlebih dahulu.');
      return;
    }

    const missing = validateSubmit();
    if (missing.length > 0) {
      window.alert(`Harap lengkapi field berikut:\n- ${missing.join('\n- ')}`);
      return;
    }

    const gel = getGelData(data, sel);
    const npsn = form.npsnHidden || form.npsn;
    const namaSekolah = form.namaSekolahHidden || form.namaSekolah;
    const payload = {
      action: 'daftar',
      gelombang: gel?.nama ?? '',
      skema: sel.skema?.nama ?? '',
      jalur: sel.jalur?.nama ?? '',
      jalur_subtipe: sel.jalur?.rplSubtipe?.nama ?? '',
      mitra: sel.mitra?.nama ?? '',
      prodi: sel.prodi ?? '',
      nama_lengkap: form.nama,
      nik: form.nik,
      tempat_lahir: form.ttl,
      tanggal_lahir: form.tgl,
      jenis_kelamin: form.jk,
      agama: form.agama,
      email: form.email,
      email_verified: true,
      no_wa: normalizeWa(form.wa),
      wa_verified: verifWa,
      alamat_jalan: form.alamat,
      rt: form.rt,
      rw: form.rw,
      desa_kelurahan: form.desa,
      kecamatan: form.kecamatan,
      kota_kabupaten: form.kota,
      provinsi: form.provinsi,
      nisn: form.nisn,
      npsn,
      nama_sekolah: namaSekolah,
      jurusan_sekolah: form.jurusanSekolah,
      rekomendasi: form.referral,
      spa_normal: cost.spaNorm,
      spa_bayar: cost.spaFinal,
      spp: cost.sppFinal,
      ang_pertama: bayarAwal,
    };

    setIsSubmitting(true);
    try {
      const res = await postPmbAction<ApiResult>(payload, 30000);
      if (res.success) {
        setModalTitle('Yeeeey! 🎉');
        setModalBody(`${form.nama}... Pendaftaranmu di UTDI telah berhasil! Nomor Pendaftaran: ${res.no_daftar ?? '-'} Segera periksa WhatsApp dan/atau Email kamu.`);
        setModalOpen(true);
        let seconds = 10;
        setModalCountdown(`Halaman akan otomatis kembali dalam ${seconds} detik...`);
        const timer = window.setInterval(() => {
          seconds -= 1;
          setModalCountdown(`Halaman akan otomatis kembali dalam ${seconds} detik...`);
          if (seconds <= 0) {
            window.clearInterval(timer);
            closeModal();
          }
        }, 1000);
      } else {
        const message = res.error || 'Coba lagi.';
        if (message.includes('sudah terdaftar')) {
          setModalTitle('Sudah Terdaftar');
          setModalBody(message);
          setModalCountdown('');
          setModalOpen(true);
        } else {
          window.alert(`Gagal: ${message}`);
        }
      }
    } catch (err) {
      const message = err instanceof DOMException && err.name === 'AbortError'
        ? 'Timeout - server terlalu lama merespon. Coba lagi.'
        : 'Gagal terhubung ke server. Coba lagi.';
      window.alert(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setVerifWa(!waEnabled);
    setCurrentStep(0);
    setSel((prev) => ({ ...INITIAL_SELECTION, gel: activeGel?.id ?? prev.gel }));
    setForm(INITIAL_FORM);
    setModalCountdown('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderProgress() {
    const labels = ['Gelombang', 'Skema', 'Jalur', 'Prodi', 'Estimasi', 'Daftar'];
    const icons = ['📅', '🎓', '🔀', '📚', '💰', '✓'];
    return (
      <div className="wizard-progress">
        {labels.map((label, index) => (
          <div key={label} style={{ display: 'contents' }}>
            <div className="wp-step">
              <div id={`wc${index}`} className={`wp-circle ${index < currentStep ? 'done' : ''} ${index === currentStep ? 'active' : ''}`}>
                {index < currentStep ? '✓' : icons[index]}
              </div>
              <div id={`wl${index}`} className={`wp-label ${index < currentStep ? 'done' : ''} ${index === currentStep ? 'active' : ''}`}>{label}</div>
            </div>
            {index < labels.length - 1 && <div id={`wline${index}`} className={`wp-line ${index < currentStep ? 'done' : ''}`} />}
          </div>
        ))}
      </div>
    );
  }

  const loaderVisible = isLoading && !data;

  return (
    <div className="page-shell">
      <div id="pmb-loading" className={loaderVisible ? '' : 'fade-out hidden'}>
        <div className="loading-logo">UTDi</div>
        <div className="loading-spinner" />
        <div className="loading-text">
          {error && !data ? (
            <>
              <div>Gagal memuat data PMB.</div>
              <button type="button" className="hero-card-btn" onClick={retry} style={{ marginTop: 12 }}>Coba Lagi</button>
            </>
          ) : 'Memuat data PMB...'}
        </div>
      </div>

      <nav>
        <div className="nav-logo" onClick={() => goTo('home')} role="button" tabIndex={0}>
          {cfg(data, 'logo_url') ? <img className="nav-logo-img" src={cfg(data, 'logo_url')} alt="Logo UTDI" /> : <div className="nav-logo-box">{cfg(data, 'logo_footer_teks', 'UTDi')}</div>}
          <div className="nav-logo-text">{cfg(data, 'nama_univ', 'Universitas Teknologi Digital Indonesia')}</div>
        </div>
        <ul className="nav-links">
          <li><a href="#skema-info">Skema</a></li>
          <li><a href="#prodi-info">Prodi</a></li>
          <li><a href="#jalur-info">Jalur Masuk</a></li>
          <li><a href="#pendaftaran">Daftar</a></li>
          <li><a href="#cek-biaya">Cek Biaya</a></li>
          <li><a href="#beasiswa">Beasiswa</a></li>
          <li><a href="#cicilan">Cara Bayar</a></li>
        </ul>
        <button className="nav-cta" type="button" onClick={() => goTo('pendaftaran')}>{txt(data, 'nav_cta_teks', 'Mulai Daftar')}</button>
      </nav>

      <section className="hero" id="home">
        <div className="hero-grid" />
        <div className="hero-orb1" />
        <div className="hero-orb2" />
        <div className="hero-inner">
          <div>
            <div className="hero-badge"><span className="hero-badge-dot" /> <span>{txt(data, 'hero_badge_teks', 'PMB UTDI Dibuka')}</span></div>
            <h1>{cfg(data, 'hero_title_1', 'Daftarkan Dirimu')}<br />di Kampus<br /><span className="hl-accent">{cfg(data, 'hero_title_2', 'Digital Terbaik')}</span></h1>
            <p className="hero-sub">{cfg(data, 'hero_subtitle', 'Pilih skema belajar, jalur, dan prodi yang tepat. Cek estimasi biaya secara transparan.')}</p>
            <div className="hero-btns">
              <button className="btn-main" type="button" onClick={() => goTo('pendaftaran')}>Mulai Pendaftaran</button>
              <button className="btn-sec" type="button" onClick={() => goTo('cicilan')}>Lihat Cara Bayar</button>
            </div>
            <div className="hero-stats">
              <div className="hstat"><div className="hstat-num">{cfg(data, 'hero_stat_1_val', '6')}</div><div className="hstat-label">{cfg(data, 'hero_stat_1_label', 'Program Studi')}</div></div>
              <div className="sdivider" />
              <div className="hstat"><div className="hstat-num">{cfg(data, 'hero_stat_2_val', '4')}</div><div className="hstat-label">{cfg(data, 'hero_stat_2_label', 'Gelombang')}</div></div>
              <div className="sdivider" />
              <div className="hstat"><div className="hstat-num">{cfg(data, 'hero_stat_3_val', '50%')}</div><div className="hstat-label">{cfg(data, 'hero_stat_3_label', 'Potongan SPA')}</div></div>
            </div>
          </div>
          <div className="gel-status-card">
            <div className="gel-status-title">Status Gelombang Saat Ini</div>
            <div id="heroGelItems">
              {(data?.gelombang ?? []).map((gel) => {
                const isCurrent = isGelombangAktif(gel);
                const isPast = todayInt() > parseDateInt(gel.tanggal_selesai);
                return (
                  <div key={String(gel.id)} className={`gel-item ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''}`}>
                    <div className="gel-item-top">
                      <span className="gel-name">{gel.nama}</span>
                      <span className={`gel-chip ${isCurrent ? 'chip-active' : isPast ? 'chip-ended' : 'chip-soon'}`}>{isCurrent ? 'SEDANG BERJALAN' : isPast ? 'BERAKHIR' : `POTONGAN ${gel.label_potongan ?? ''}`}</span>
                    </div>
                    <div className="gel-dates">{formatTanggal(gel.tanggal_mulai)} - {formatTanggal(gel.tanggal_selesai)}</div>
                    <div className="gel-cut">Potongan SPA {gel.label_potongan}</div>
                  </div>
                );
              })}
            </div>
            <button className="hero-card-btn" type="button" onClick={() => goTo('pendaftaran')}>Mulai Pendaftaran Sekarang →</button>
          </div>
        </div>
      </section>

      <section className="skema-info-section" id="skema-info">
        <div className="section-head">
          <div className="section-label">SKEMA PEMBELAJARAN</div>
          <h2 className="section-title">Pilih Cara Belajar yang Paling Cocok</h2>
          <p className="section-sub">UTDI menyediakan skema pembelajaran yang fleksibel sesuai kebutuhanmu.</p>
        </div>
        <div className="skema-compare-grid">
          {(data?.skema ?? []).map((skema) => (
            <div className="skema-info-card" key={skema.id}>
              <CardIcon iconUrl={skema.icon_url} emoji={skema.icon_emoji} fallback="🎓" />
              <h3 style={{ marginTop: 14 }}>{skema.nama}</h3>
              <p>{skema.deskripsi}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="prodi-info-section" id="prodi-info">
        <div className="section-head">
          <div className="section-label">PROGRAM STUDI</div>
          <h2 className="section-title">{(data?.prodi ?? []).length || 6} Prodi untuk Masa Depan Digital</h2>
          <p className="section-sub">Klik tiap prodi untuk melihat ringkasan, prospek karir, dan jalur pendaftaran.</p>
        </div>
        <div className="prodi-info-grid">
          {(data?.prodi ?? []).map((prodi) => (
            <div className="prodi-info-card" key={prodi.id}>
              <CardIcon iconUrl={prodi.icon_url} emoji={prodi.icon_emoji} fallback="📘" color={valueToString(prodi.warna, 'var(--navy)')} />
              <h3 style={{ marginTop: 14 }}>{prodi.nama}</h3>
              <p>{prodi.deskripsi_singkat}</p>
              <span className="tag-chip">{prodi.jenjang}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="jalur-info-section" id="jalur-info">
        <div className="section-head">
          <div className="section-label">JALUR PENDAFTARAN</div>
          <h2 className="section-title">Jalur Masuk yang Tersedia</h2>
          <p className="section-sub">Pilih jalur yang paling sesuai dengan latar belakang dan dokumen yang kamu miliki.</p>
        </div>
        <div className="jalur-info-grid">
          {(data?.jalur ?? []).map((jalur) => (
            <div className="jalur-info-card" key={jalur.id}>
              <CardIcon iconUrl={jalur.icon_url} emoji={jalur.icon_emoji} fallback="📋" color={truthy(jalur.is_kipk) ? 'var(--accent)' : valueToString(jalur.warna_icon, 'var(--navy)')} />
              <h3 style={{ marginTop: 14 }}>{jalur.nama}</h3>
              <p>{jalur.deskripsi}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="wizard-section" id="pendaftaran">
        <div className="section-head">
          <div className="section-label">ALUR PENDAFTARAN</div>
          <h2 className="section-title">Daftar Langkah demi Langkah</h2>
          <p className="section-sub">Ikuti 6 langkah mudah untuk menyelesaikan pendaftaran mahasiswa baru UTDI.</p>
          {isValidating && <p className="section-sub" style={{ color: 'var(--accent)', marginTop: 8 }}>Memperbarui data terbaru...</p>}
        </div>
        {renderProgress()}

        <div className={`wizard-panel ${currentStep === 0 ? 'active' : ''}`} id="panel0">
          <div className="step-title">Langkah 1 dari 6 - Gelombang Pendaftaran</div>
          <p className="step-sub">{txt(data, 'wizard_step0_sub', 'Gelombang ditentukan otomatis berdasarkan tanggal pendaftaran kamu hari ini.')}</p>
          <div className="gel-cards" id="gelCardsAuto">
            {(data?.gelombang ?? []).map((gel) => {
              const isCurrent = isGelombangAktif(gel);
              const isPast = todayInt() > parseDateInt(gel.tanggal_selesai);
              return (
                <div key={String(gel.id)} className={`gel-card ${isCurrent ? 'current-gel' : ''} ${isPast ? 'past-gel' : ''}`}>
                  <CardIcon emoji="✨" fallback="✨" color={isCurrent ? 'var(--accent)' : 'var(--navy)'} />
                  <h3>{gel.nama}</h3>
                  <p>{formatTanggal(gel.tanggal_mulai)} - {formatTanggal(gel.tanggal_selesai)}</p>
                  <span className="potongan-chip">Potongan SPA {gel.label_potongan}</span>
                </div>
              );
            })}
          </div>
          <div id="gelAutoInfo" style={{ marginTop: 16, background: 'rgba(245,176,65,.1)', border: '1px solid rgba(245,176,65,.35)', borderRadius: 12, padding: '14px 18px', fontSize: '.875rem', color: '#92400e', lineHeight: 1.6 }}>
            {activeGel ? <>Kamu mendaftar pada <strong>{activeGel.nama}</strong> - Potongan SPA <strong>{activeGel.label_potongan}</strong> otomatis berlaku.</> : txt(data, 'notif_no_gelombang', 'Saat ini belum ada gelombang aktif.')}
          </div>
          <div className="wizard-nav">
            <div />
            <button className="btn-next" id="nextBtn0" type="button" onClick={() => nextStep(1)}>Lanjut: Pilih Skema →</button>
          </div>
        </div>

        <div className={`wizard-panel ${currentStep === 1 ? 'active' : ''}`} id="panel1">
          <div className="step-title">Langkah 2 dari 6 - Pilih Skema Pembelajaran</div>
          <p className="step-sub">{txt(data, 'wizard_step1_sub', 'Pilih metode belajar yang paling sesuai dengan aktivitas dan kebutuhanmu.')}</p>
          <div className="skema-cards" id="skemaCardsWizard">
            {(data?.skema ?? []).map((skema) => (
              <div key={skema.id} className={`skema-card ${sel.skema?.id === skema.id ? 'selected' : ''}`} data-id={skema.id} data-nama={skema.nama} onClick={() => pilihSkema(skema)}>
                <CardIcon iconUrl={skema.icon_url} emoji={skema.icon_emoji} fallback="🎓" />
                <h3>{skema.nama}</h3>
                <p>{skema.deskripsi}</p>
              </div>
            ))}
          </div>
          <div id="mitraPanel" style={{ display: sel.skema?.id === 'kerjasama' ? 'block' : 'none', marginTop: 20, border: '1.5px solid var(--border)', borderRadius: 16, padding: 24, background: '#fafbff' }}>
            <div style={{ fontSize: '.875rem', fontWeight: 500, color: 'var(--navy)', marginBottom: 6 }}>Pilih Instansi Mitra</div>
            <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 16 }}>Pilih instansi/lembaga yang bekerja sama dengan UTDI.</p>
            <div id="mitraGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              {(data?.mitra ?? []).map((mitra) => (
                <div key={mitra.id} className="mitra-card" onClick={() => pilihMitra(mitra)} style={{ borderColor: sel.mitra?.id === mitra.id ? 'var(--navy)' : 'var(--border)', background: sel.mitra?.id === mitra.id ? 'rgba(26,46,110,.04)' : '#fff' }}>
                  <CardIcon iconUrl={mitra.icon_url} emoji={mitra.icon_emoji} fallback="🏛️" color={valueToString(mitra.warna_icon, 'var(--navy)')} />
                  <div><h3>{mitra.nama}</h3><p>{mitra.deskripsi}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="wizard-nav">
            <button className="btn-prev" type="button" onClick={() => prevStep(0)}>← Kembali</button>
            <button className="btn-next" id="nextBtn1" type="button" disabled={!sel.skema || (sel.skema.id === 'kerjasama' && !sel.mitra)} onClick={() => nextStep(2)}>Lanjut: Pilih Jalur →</button>
          </div>
        </div>

        <div className={`wizard-panel ${currentStep === 2 ? 'active' : ''}`} id="panel2">
          <div className="step-title">Langkah 3 dari 6 - Pilih Jalur Pendaftaran</div>
          <p className="step-sub">{txt(data, 'wizard_step2_sub', 'Pilih jalur yang sesuai dengan latar belakang dan dokumenmu.')}</p>
          <div className="jalur-grid" id="jalurGrid">
            {availableJalur().map((jalur) => (
              <div key={jalur.id} className={`jalur-card ${sel.jalur?.id === jalur.id ? 'selected' : ''}`} id={`jalurCard-${jalur.id}`} data-kipk={String(Boolean(jalur.is_kipk))} onClick={() => pilihJalur(jalur)}>
                <CardIcon iconUrl={jalur.icon_url} emoji={jalur.icon_emoji} fallback="📋" color={truthy(jalur.is_kipk) ? 'var(--accent)' : valueToString(jalur.warna_icon, 'var(--navy)')} />
                <div><h3>{jalur.nama}</h3><p>{jalur.deskripsi}</p></div>
              </div>
            ))}
          </div>
          <div id="rplSubPanel" style={{ display: sel.jalur?.id === 'rpl' ? 'block' : 'none', marginTop: 20, border: '1.5px solid var(--border)', borderRadius: 16, padding: 24, background: '#f8faff' }}>
            <div style={{ fontSize: '.875rem', fontWeight: 500, color: 'var(--navy)', marginBottom: 6 }}>Pilih Tipe RPL</div>
            <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 16 }}>Pilih tipe RPL sesuai latar belakang kamu. Biaya berbeda antar tipe.</p>
            <div id="rplSubGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              {(data?.rpl_subtipe ?? []).map((rpl) => (
                <div key={rpl.id} className="rpl-sub-card" onClick={() => pilihRplSubtipe(rpl)} style={{ borderColor: sel.jalur?.rplSubtipe?.id === rpl.id ? 'var(--navy)' : 'var(--border)', background: sel.jalur?.rplSubtipe?.id === rpl.id ? 'rgba(26,46,110,.04)' : '#fff' }}>
                  <h3>{rpl.nama}</h3>
                  <p>{rpl.deskripsi}</p>
                  <span className="tag-chip">SPP {fmt(rpl.spp_per_bulan)}/bln</span>
                </div>
              ))}
            </div>
          </div>
          <div className="wizard-nav">
            <button className="btn-prev" type="button" onClick={() => prevStep(1)}>← Kembali</button>
            <button className="btn-next" id="nextBtn2" type="button" disabled={!sel.jalur || (sel.jalur.id === 'rpl' && !sel.jalur.rplSubtipe)} onClick={() => nextStep(3)}>Lanjut: Pilih Prodi →</button>
          </div>
        </div>

        <div className={`wizard-panel ${currentStep === 3 ? 'active' : ''}`} id="panel3">
          <div className="step-title">Langkah 4 dari 6 - Pilih Program Studi</div>
          <p className="step-sub">{txt(data, 'wizard_step3_sub', 'Pilih program studi yang paling sesuai dengan minat dan rencana karirmu.')}</p>
          <div className="prodi-grid" id="prodiGridWizard">
            {availableProdi().map((prodi) => (
              <div key={prodi.id} className={`prodi-card ${sel.prodi === prodi.id ? 'selected' : ''}`} onClick={() => pilihProdi(prodi.id)}>
                <CardIcon iconUrl={prodi.icon_url} emoji={prodi.icon_emoji} fallback="📘" color={valueToString(prodi.warna, 'var(--navy)')} />
                <h3>{prodi.nama}</h3>
                <span className="tag-chip">{prodi.jenjang}</span>
                <p style={{ marginTop: 8 }}>{prodi.deskripsi_singkat}</p>
                <div className="prodi-spp">SPP: {fmt(getBiayaData(data, { ...sel, prodi: prodi.id })?.spp_tetap)}/sem</div>
              </div>
            ))}
          </div>
          <div className="wizard-nav">
            <button className="btn-prev" type="button" onClick={() => prevStep(2)}>← Kembali</button>
            <button className="btn-next" id="nextBtn3" type="button" disabled={!sel.prodi} onClick={() => nextStep(4)}>Lanjut: Estimasi Biaya →</button>
          </div>
        </div>

        <div className={`wizard-panel ${currentStep === 4 ? 'active' : ''}`} id="panel4">
          <div className="step-title">Langkah 5 dari 6 - Estimasi Biaya</div>
          <p className="step-sub">Berdasarkan pilihan kamu, berikut estimasi biaya yang perlu disiapkan.</p>
          <CostSummary data={data} sel={sel} cost={cost} bayarAwal={bayarAwal} currentGel={currentGel} currentProdi={currentProdi} />
          <div className="wizard-nav">
            <button className="btn-prev" type="button" onClick={() => prevStep(3)}>← Kembali</button>
            <button className="btn-next" type="button" onClick={() => nextStep(5)}>Lanjut: Isi Data Diri →</button>
          </div>
        </div>

        <div className={`wizard-panel ${currentStep === 5 ? 'active' : ''}`} id="panel5">
          <div className="step-title">Langkah 6 dari 6 - Lengkapi Data Diri</div>
          <p className="step-sub">Isi data dirimu dengan benar dan verifikasi kontak sebelum mengirim pendaftaran.</p>
          <div className="submit-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="submit-form">
                <h3 style={{ marginBottom: 16 }}>Data Diri</h3>
                <div className="form-row">
                  <Input id="fNama" label="Nama Lengkap *" value={form.nama} onChange={(value) => setField('nama', value)} placeholder="Sesuai KTP/Akte" />
                  <Input id="fNik" label="NIK *" value={form.nik} onChange={(value) => setField('nik', value)} placeholder="16 digit NIK KTP" maxLength={16} />
                </div>
                <div className="form-row">
                  <Input id="fTtl" label="Tempat Lahir *" value={form.ttl} onChange={(value) => setField('ttl', value)} placeholder="Kota lahir" />
                  <Input id="fTgl" label="Tanggal Lahir *" type="date" value={form.tgl} onChange={(value) => setField('tgl', value)} />
                </div>
                <div className="form-row">
                  <Select id="fJk" label="Jenis Kelamin *" value={form.jk} onChange={(value) => setField('jk', value)} options={['Laki-laki', 'Perempuan']} placeholder="Pilih" />
                  <Select id="fAgama" label="Agama *" value={form.agama} onChange={(value) => setField('agama', value)} options={['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu']} placeholder="Pilih" />
                </div>
              </div>

              <div className="submit-form">
                <h3 style={{ marginBottom: 16 }}>Kontak & Verifikasi</h3>
                <div className="form-group">
                  <label className="form-label" htmlFor="fWa">Nomor WhatsApp *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input id="fWa" type="tel" className="form-input" value={form.wa} placeholder="628xxxxxxxxxx" style={{ flex: 1 }} onChange={(event) => resetVerifWa(event.target.value)} />
                    <button type="button" id="btnOtpWa" className="inline-button" style={{ background: 'var(--navy)', color: '#fff', minWidth: 112 }} disabled={verifWa || otpSending || waCooldown > 0} onClick={kirimOtpWa}>
                      {verifWa ? 'Terverifikasi ✅' : otpSending ? 'Mengirim...' : waCooldown > 0 ? `Kirim Ulang (${waCooldown}s)` : 'Kirim Kode'}
                    </button>
                  </div>
                  <div id="waVerifRow" style={{ display: showWaOtp && !verifWa ? 'block' : 'none', marginTop: 12, background: 'rgba(30,42,68,.04)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: '.8rem', color: 'var(--navy)', fontWeight: 600, marginBottom: 10 }}>Kode dikirim ke WhatsApp kamu. Masukkan di sini:</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input id="fOtpWa" type="text" className="form-input" value={form.otpWa} onChange={(event) => setField('otpWa', event.target.value.toUpperCase())} placeholder="A B 3 X 7 K" maxLength={6} style={{ flex: 1, letterSpacing: 8, fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase', textAlign: 'center', height: 52, border: '2px solid var(--navy)' }} />
                      <button type="button" id="btnVerifWa" className="inline-button" style={{ background: '#22c55e', color: '#fff', height: 52 }} disabled={otpChecking} onClick={verifikasiOtpWa}>{otpChecking ? 'Memeriksa...' : 'Verifikasi ✓'}</button>
                    </div>
                    <div id="statusWa" style={{ fontSize: '.78rem', marginTop: 8, minHeight: 20, color: waStatus.includes('Gagal') || waStatus.includes('tidak') ? 'var(--error)' : 'var(--navy)' }}>{waStatus}</div>
                  </div>
                </div>
                <Input id="fEmail" label="Email (opsional)" type="email" value={form.email} onChange={(value) => setField('email', value)} placeholder="email@gmail.com" />
              </div>

              <div className="submit-form">
                <h3 style={{ marginBottom: 16 }}>Alamat</h3>
                <Input id="fAlamat" label="Alamat Jalan *" value={form.alamat} onChange={(value) => setField('alamat', value)} placeholder="Nama jalan, nomor rumah, RT/RW" />
                <div className="form-row">
                  <Input id="fRt" label="RT" value={form.rt} onChange={(value) => setField('rt', value)} placeholder="001" />
                  <Input id="fRw" label="RW" value={form.rw} onChange={(value) => setField('rw', value)} placeholder="001" />
                </div>
                <div className="form-row">
                  <Input id="fDesa" label="Desa / Kelurahan" value={form.desa} onChange={(value) => setField('desa', value)} placeholder="Nama desa/kelurahan" />
                  <Input id="fKecamatan" label="Kecamatan" value={form.kecamatan} onChange={(value) => setField('kecamatan', value)} placeholder="Nama kecamatan" />
                </div>
                <div className="form-row">
                  <Select id="fProvinsi" label="Provinsi *" value={form.provinsi} onChange={(value) => setForm((prev) => ({ ...prev, provinsi: value, kota: '' }))} options={Object.keys(data?.prov_kab ?? {}).sort()} placeholder="— Pilih Provinsi —" />
                  <Select id="fKota" label="Kota / Kabupaten *" value={form.kota} onChange={(value) => setField('kota', value)} options={(form.provinsi && data?.prov_kab?.[form.provinsi] ? [...data.prov_kab[form.provinsi]].sort() : [])} placeholder={form.provinsi ? '— Pilih Kota/Kabupaten —' : '— Pilih Provinsi dulu —'} />
                </div>
              </div>

              <div className="submit-form">
                <h3 style={{ marginBottom: 16 }}>Data Sekolah</h3>
                <Input id="fNisn" label="NISN" value={form.nisn} onChange={(value) => setField('nisn', value)} placeholder="Nomor Induk Siswa Nasional" />
                <div className="form-group">
                  <label className="form-label" htmlFor="fCariSekolah">Cari Sekolah via NPSN / Nama</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input id="fCariSekolah" className="form-input" value={form.cariSekolah} onChange={(event) => setField('cariSekolah', event.target.value)} placeholder="Ketik NPSN atau nama sekolah..." style={{ flex: 1 }} />
                    <button type="button" className="inline-button" style={{ background: 'var(--light)', color: 'var(--navy)', border: '1.5px solid var(--border)' }} onClick={toggleManualSekolah}>Input Manual</button>
                  </div>
                  <div id="hasilCariSekolah" style={{ display: showSchoolResults ? 'block' : 'none', border: '1.5px solid var(--border)', borderRadius: 10, marginTop: 6, maxHeight: 200, overflowY: 'auto', background: '#fff' }}>
                    {schoolResults.length ? schoolResults.map((school) => (
                      <button key={`${school.npsn}-${school.nama_sekolah}`} type="button" onClick={() => selectSchool(school)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', cursor: 'pointer', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', fontSize: '.8rem' }}>
                        <strong>{school.nama_sekolah}</strong><br /><span style={{ color: 'var(--muted)' }}>NPSN: {school.npsn} · {school.kabupaten}, {school.provinsi}</span>
                      </button>
                    )) : <div style={{ padding: 12, fontSize: '.75rem', color: 'var(--muted)' }}>Tidak ditemukan. Gunakan Input Manual.</div>}
                  </div>
                </div>
                <div id="manualSekolahGroup" style={{ display: manualSekolah ? 'block' : 'none' }}>
                  <Input id="fNpsn" label="NPSN" value={form.npsn} onChange={(value) => setField('npsn', value)} placeholder="Nomor Pokok Sekolah Nasional" />
                  <Input id="fNamaSekolah" label="Nama Sekolah *" value={form.namaSekolah} onChange={(value) => setField('namaSekolah', value)} placeholder="Nama SMA/SMK/MA/sederajat" />
                </div>
                <input type="hidden" id="fNpsnHidden" value={form.npsnHidden} readOnly />
                <input type="hidden" id="fNamaSekolahHidden" value={form.namaSekolahHidden} readOnly />
                <div id="sekolahTerpilih" style={{ display: form.namaSekolahHidden ? 'block' : 'none', background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '10px 14px', fontSize: '.75rem', color: '#166534', marginTop: 6 }}>✅ {form.namaSekolahHidden} (NPSN: {form.npsnHidden})</div>
                <Select id="fJurusanSekolah" label="Jurusan Sekolah *" value={form.jurusanSekolah} onChange={(value) => setField('jurusanSekolah', value)} options={data?.jurusan_sma ?? []} placeholder="— Pilih Jurusan —" />
                <Input id="fReferral" label="Siapa yang merekomendasikan kamu kuliah di UTDI?" value={form.referral} onChange={(value) => setField('referral', value)} placeholder="Nama orang / sumber informasi" />
              </div>
            </div>

            <div className="submit-summary">
              <h3 style={{ marginBottom: 16 }}>Ringkasan Pendaftaran</h3>
              <SummaryItem label="Gelombang" value={currentGel?.nama ?? '—'} id="ssGel" />
              <SummaryItem label="Skema" value={`${sel.skema?.nama ?? '—'}${sel.mitra ? ` (${sel.mitra.nama})` : ''}`} id="ssSkema" />
              <SummaryItem label="Jalur" value={sel.jalur ? `${sel.jalur.nama}${sel.jalur.rplSubtipe ? ` - ${sel.jalur.rplSubtipe.nama}` : ''}` : '—'} id="ssJalur" />
              <SummaryItem label="Program Studi" value={currentProdi ? `${currentProdi.nama} - ${currentProdi.jenjang}` : '—'} id="ssProdi" />
              <SummaryItem label="SPA (setelah potongan)" value={cost.spaFinal === 0 ? 'Rp 0 (Ditanggung)' : fmt(cost.spaFinal)} id="ssSPA" />
              <SummaryItem label="SPP" value={`${fmt(cost.sppFinal)}${cost.isSppBulanan ? '/bulan' : '/sem'}`} id="ssSPP" />
              <SummaryItem label="Angsuran Pertama" value={`${getCicilanDP(data)}% SPA + SPP`} id="ssAwal" />
              <div className="ss-total"><span>Bayar Saat Registrasi</span><strong id="ssBayarAwal">{bayarAwal === 0 ? 'Rp 0 (Bebas Biaya)' : fmt(bayarAwal)}</strong></div>
              <div style={{ marginTop: 14, padding: 12, background: 'var(--light)', borderRadius: 10, fontSize: '.75rem' }}>
                <div style={{ marginBottom: 4, fontWeight: 500, color: 'var(--navy)' }}>Status Verifikasi</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>WhatsApp</span><span id="badgeWa" style={{ color: verifWa ? 'var(--success)' : 'var(--muted)' }}>{verifWa ? '✅ Terverifikasi' : '⬜ Belum'}</span></div>
              </div>
              <button className="btn-submit" style={{ width: '100%', marginTop: 16 }} type="button" onClick={submitDaftar} id="btnSubmitFinal" disabled={isSubmitting}>{isSubmitting ? 'Mengirim...' : '🚀 Kirim Pendaftaran'}</button>
              <p style={{ fontSize: '.74rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>{txt(data, 'modal_sukses_body', 'Tim admisi akan menghubungi dalam 1x24 jam kerja.')}</p>
            </div>
          </div>
          <div className="wizard-nav"><button className="btn-prev" type="button" onClick={() => prevStep(4)}>← Kembali</button><div /></div>
        </div>
      </section>

      <CostChecker data={data} />
      <CicilanSection data={data} />
      <BeasiswaSection data={data} />
      <Footer data={data} />

      <div className="sticky-bar">
        <div><p>{cfg(data, 'sticky_bar_teks', 'PMB UTDI · Potongan SPA hingga')}</p><strong>{cfg(data, 'sticky_bar_bold', '50% - Bayar 35% SPA saat Registrasi')}</strong></div>
        <button className="sticky-bar-btn" type="button" onClick={() => goTo('pendaftaran')}>Mulai Daftar →</button>
      </div>

      <div className={`modal-overlay ${modalOpen ? 'show' : ''}`} id="modalSuccess">
        <div className="modal-box">
          <div className="modal-icon">🎉</div>
          <h2 id="modalTitle">{modalTitle}</h2>
          <div id="modalBody" style={{ fontSize: '.875rem', lineHeight: 1.7, marginBottom: 16, color: 'var(--muted)' }}>{modalBody}</div>
          <button className="modal-btn" type="button" onClick={closeModal}>Tutup & Kembali ke Halaman Utama</button>
          <div id="modalCountdown" style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 10 }}>{modalCountdown}</div>
        </div>
      </div>
    </div>
  );
}

function Input({ id, label, value, onChange, placeholder, type = 'text', maxLength }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; maxLength?: number }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input id={id} className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} />
    </div>
  );
}

function Select({ id, label, value, onChange, options, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; options: string[]; placeholder: string }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <select id={id} className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function SummaryItem({ label, value, id }: { label: string; value: string; id: string }) {
  return <div className="ss-item"><span>{label}</span><strong id={id}>{value}</strong></div>;
}

function CostSummary({ data, sel, cost, bayarAwal, currentGel, currentProdi }: { data: PmbData | null; sel: SelectionState; cost: ReturnType<typeof calculateCost>; bayarAwal: number; currentGel: Gelombang | null; currentProdi: Prodi | null }) {
  return (
    <div className="estimasi-layout">
      <div className="estimasi-summary">
        <h3>Pilihan Kamu</h3>
        <div className="sum-row"><span>GELOMBANG</span><strong id="sumGel">{currentGel ? `${currentGel.nama} (Potongan ${currentGel.label_potongan})` : '—'}</strong></div>
        <div className="sum-row"><span>SKEMA</span><strong id="sumSkema">{sel.skema?.nama ?? '—'}</strong></div>
        <div className="sum-row"><span>JALUR</span><strong id="sumJalur">{sel.jalur ? `${sel.jalur.nama}${sel.jalur.rplSubtipe ? ` - ${sel.jalur.rplSubtipe.nama}` : ''}` : '—'}</strong></div>
        <div className="sum-row"><span>PROGRAM STUDI</span><strong id="sumProdi">{currentProdi ? `${currentProdi.nama} - ${currentProdi.jenjang}` : '—'}</strong></div>
        <div style={{ background: 'rgba(15,157,140,.08)', border: '1px solid rgba(15,157,140,.2)', borderRadius: 12, padding: 14, fontSize: '.75rem', color: '#065f46', lineHeight: 1.6, marginTop: 18 }}>Biaya dapat berubah sesuai hasil validasi admisi. Estimasi ini bersifat indikatif.</div>
      </div>
      <div className="estimasi-biaya">
        <h3>Estimasi Biaya Kuliah</h3>
        <p style={{ fontSize: '.75rem', opacity: .6, marginBottom: 20 }}>Berdasarkan pilihan gelombang dan program studi.</p>
        {cost.spaFinal > 0 && <div className="biaya-item"><div className="bi-left"><h4>SPA (Normal)</h4><p>Sumbangan Pengembangan Akademik</p></div><div className="bi-val" id="eSPANorm">{fmt(cost.spaNorm)}</div></div>}
        {cost.spaFinal > 0 && <div className="biaya-item"><div className="bi-left"><h4>Potongan Gelombang</h4><p>Diskon SPA sesuai gelombang</p></div><div className="bi-val green" id="eSPAPot">- {fmt(cost.potongan)}</div></div>}
        <div className="biaya-item"><div className="bi-left"><h4>SPA yang Dibayar</h4><p>Total setelah potongan</p></div><div className="bi-val accent" id="eSPABayar">{cost.spaFinal === 0 ? 'Tidak ada SPA' : fmt(cost.spaFinal)}</div></div>
        <div className="biaya-item"><div className="bi-left"><h4>SPP</h4><p>{cost.isSppBulanan ? 'Per bulan' : 'Per semester'}</p></div><div className="bi-val" id="eSPP">{fmt(cost.sppFinal)}{cost.isSppBulanan ? '/bulan' : '/semester'}</div></div>
        <div className="biaya-item"><div className="bi-left"><h4>Biaya SKS</h4><p>Per satuan kredit semester</p></div><div className="bi-val" id="eSKS">{cost.sksFinal === 0 ? '—' : `${fmt(cost.sksFinal)}/SKS`}</div></div>
        <div className="biaya-item"><div className="bi-left"><h4>Aanvullen</h4><p>Biaya tambahan per SKS</p></div><div className="bi-val" id="eAnv">{cost.anvFinal === 0 ? '—' : `${fmt(cost.anvFinal)}/SKS`}</div></div>
        <div className="total-box">
          <div className="total-line"><span id="cicilanLabel1">Angsuran Pertama ({getCicilanDP(data)}% SPA + SPP)</span><strong id="eBayarAwal">{fmt(bayarAwal)}</strong></div>
          <div className="total-line big"><span>Total SPA</span><strong id="eTotalSPA">{cost.spaFinal === 0 ? 'Tidak ada SPA' : fmt(cost.spaFinal)}</strong></div>
        </div>
        {cost.catatan && <div id="eCatatanJalur" style={{ marginTop: 12, background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.3)', borderRadius: 10, padding: '10px 14px', fontSize: '.75rem', color: '#4ade80', lineHeight: 1.5 }}>{cost.catatan}</div>}
      </div>
    </div>
  );
}

function CostChecker({ data }: { data: PmbData | null }) {
  const defaultGel = getActiveGelombang(data)?.id ?? data?.gelombang?.[0]?.id ?? '';
  const [tipe, setTipe] = useState('reguler');
  const [prodiId, setProdiId] = useState('');
  const [gelId, setGelId] = useState(String(defaultGel));

  useEffect(() => {
    if (!prodiId && data?.prodi?.[0]) setProdiId(data.prodi[0].id);
    if (!gelId && defaultGel) setGelId(String(defaultGel));
  }, [data?.prodi, defaultGel, gelId, prodiId]);

  const selection: SelectionState = {
    ...INITIAL_SELECTION,
    gel: gelId,
    prodi: prodiId,
    jalur: tipe === 'karyawan' ? { id: 'karyawan', nama: 'Kelas Karyawan', isKaryawan: true, sppPerBulan: 1200000 } : null,
  };
  const cost = calculateCost(data, selection);

  return (
    <section className="cek-biaya-section" id="cek-biaya">
      <div className="section-label">CEK BIAYA</div>
      <h2 className="section-title">Cek Biaya Kuliah Kamu</h2>
      <p className="section-sub" style={{ marginBottom: 36 }}>Pilih prodi, gelombang, dan tipe jalur untuk melihat simulasi biaya.</p>
      <div className="cek-layout">
        <div className="cek-form">
          <h3>Kalkulator Biaya PMB</h3>
          <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 22 }}>Pilih kombinasi untuk simulasi biaya.</p>
          <Select id="cekTipe" label="Tipe Jalur" value={tipe} onChange={setTipe} options={['reguler', 'karyawan']} placeholder="Pilih Tipe" />
          <Select id="cekProdi" label="Program Studi" value={prodiId} onChange={setProdiId} options={(data?.prodi ?? []).map((prodi) => prodi.id)} placeholder="Pilih Prodi" />
          <Select id="cekGelSelect" label="Simulasi Gelombang" value={gelId} onChange={setGelId} options={(data?.gelombang ?? []).map((gel) => String(gel.id))} placeholder="Pilih Gelombang" />
        </div>
        <div className="cek-result">
          <h3>Hasil Estimasi</h3>
          <p style={{ fontSize: '.75rem', opacity: .6, marginBottom: 18 }}>Estimasi indikatif sebelum validasi admisi.</p>
          <div className="cr-row"><div className="cr-left"><h4>SPA Normal</h4><p>Sebelum potongan</p></div><div className="cr-val" id="crSNorm">{fmt(cost.spaNorm)}</div></div>
          <div className="cr-row"><div className="cr-left"><h4>SPA Dibayar</h4><p>Total setelah potongan</p></div><div className="cr-val accent" id="crSBayar">{fmt(cost.spaFinal)}</div></div>
          <div className="cr-row"><div className="cr-left"><h4>SPP</h4><p>Per semester</p></div><div className="cr-val" id="crSPP">{fmt(cost.sppFinal)}</div></div>
          <div className="cr-total"><div className="cr-total-row main"><span>Total SPA</span><strong id="crTotal">{fmt(cost.spaFinal)}</strong></div></div>
        </div>
      </div>
    </section>
  );
}

function CicilanSection({ data }: { data: PmbData | null }) {
  return (
    <section className="cicilan-section" id="cicilan">
      <div className="section-label">CARA PEMBAYARAN</div>
      <h2 className="section-title">Sistem Cicilan yang Ringan</h2>
      <p className="section-sub" style={{ marginBottom: 40 }}>Pembayaran dilakukan secara bertahap agar lebih terjangkau.</p>
      <div className="cicilan-layout">
        <div className="estimasi-summary">
          <h3>Yang Perlu Dibayar Saat Registrasi Awal</h3>
          <p style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>Cukup bayar <strong>{getCicilanDP(data)}% SPA + SPP Tetap Semester 1</strong> untuk mendapatkan NIM dan status mahasiswa aktif.</p>
          {(data?.cicilan ?? []).map((item) => <div className="sum-row" key={valueToString(item.id, item.label)}><span>{item.label}<br /><small>{labelWaktuCicilan(item)}</small></span><strong>{item.persen_bayar}% SPA</strong></div>)}
        </div>
        <div className="timeline" id="cicilanTimeline">
          {(data?.cicilan ?? []).map((item, index) => (
            <div className="tl-item" key={valueToString(item.id, item.label)}>
              <div className="tl-dot" style={{ background: ['var(--accent)', 'var(--teal)', 'var(--purple)', 'var(--navy2)'][index % 4] }}>💰</div>
              <div className="tl-content"><div className="tl-when">{labelWaktuCicilan(item)}</div><h4>{item.label}</h4><p>{item.deskripsi}</p><span className="tag-chip">{item.persen_bayar}% SPA</span></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BeasiswaSection({ data }: { data: PmbData | null }) {
  return (
    <section style={{ padding: '80px 5%', background: 'var(--white)' }} id="beasiswa">
      <div className="section-head">
        <div className="section-label">PROGRAM BEASISWA</div>
        <h2 className="section-title">Wujudkan Impianmu dengan Beasiswa</h2>
        <p className="section-sub">UTDI menyediakan berbagai jalur beasiswa agar pendidikan berkualitas bisa diakses semua kalangan.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 24, maxWidth: 900, margin: '0 auto' }}>
        {(data?.beasiswa ?? []).map((beasiswa: Beasiswa) => (
          <div className="info-card" key={valueToString(beasiswa.id, beasiswa.nama)}>
            <CardIcon iconUrl={beasiswa.icon_url} emoji={beasiswa.icon_emoji} fallback="🏆" />
            <div style={{ fontSize: '.75rem', fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', marginTop: 14 }}>{beasiswa.penyelenggara}</div>
            <h3>{beasiswa.nama}</h3>
            <p>{beasiswa.deskripsi}</p>
            {beasiswa.manfaat && <div style={{ background: '#fef9ec', borderRadius: 10, padding: '12px 14px', fontSize: '.75rem', color: '#92400e', marginTop: 14 }}><strong>{beasiswa.manfaat}</strong></div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer({ data }: { data: PmbData | null }) {
  return (
    <footer id="mainFooter">
      <div className="footer-grid">
        <div className="footer-brand">
          {cfg(data, 'logo_url') ? <img className="footer-logo-img" src={cfg(data, 'logo_url')} alt="Logo UTDI" /> : <div className="footer-logo">{cfg(data, 'logo_footer_teks', 'UTDi')}</div>}
          <p>{cfg(data, 'nama_univ', 'UTDI')}<br />{cfg(data, 'tagline_footer', valueToString(data?.footer?.tagline_footer, 'Kampus teknologi untuk masa depan digital.'))}</p>
          <div className="socials">{(data?.sosmed ?? []).map((social) => <a className="social-btn" key={valueToString(social.id, valueToString(social.platform))} href={valueToString(social.url, '#')} target="_blank" rel="noreferrer">{valueToString(social.platform, 'S').charAt(0)}</a>)}</div>
        </div>
        <div className="footer-col"><h4>Pendaftaran</h4><ul><li><a href="#pendaftaran">Mulai Daftar</a></li><li><a href="#cek-biaya">Cek Biaya</a></li><li><a href="#cicilan">Cara Pembayaran</a></li></ul></div>
        <div className="footer-col"><h4>Program Studi</h4><ul>{(data?.prodi ?? []).map((prodi) => <li key={prodi.id}><a>{prodi.nama} ({prodi.jenjang})</a></li>)}</ul></div>
        <div className="footer-col"><h4>Kontak Admisi</h4><div className="footer-contact"><div>📍 {cfg(data, 'alamat')}</div><div>📞 {cfg(data, 'telepon_admisi')}</div><div>✉️ {cfg(data, 'email_admisi')}</div><div>🌐 {cfg(data, 'website')}</div></div></div>
      </div>
      <div className="footer-bottom"><span>{cfg(data, 'copyright_teks', valueToString(data?.footer?.copyright_teks, '© 2026 UTDI. Hak cipta dilindungi.'))}</span><span>{valueToString(data?.footer?.link_privasi_label, 'Kebijakan Privasi')} · {valueToString(data?.footer?.link_tnc_label, 'Syarat & Ketentuan')}</span></div>
    </footer>
  );
}
