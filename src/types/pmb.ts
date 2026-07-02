export type Primitive = string | number | boolean | null | undefined;

export interface SheetRecord {
  [key: string]: Primitive | Primitive[] | SheetRecord | SheetRecord[];
}

export interface Gelombang extends SheetRecord {
  id: string | number;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  potongan_persen?: number | string;
  label_potongan?: string;
  teks_badge?: string;
  bayar_dp_persen?: number | string;
}

export interface Skema extends SheetRecord {
  id: string;
  nama: string;
  deskripsi?: string;
  warna_header?: string;
  note_kipk?: string | boolean;
  icon_url?: string;
  icon_emoji?: string;
}

export interface Jalur extends SheetRecord {
  id: string;
  nama: string;
  deskripsi?: string;
  tersedia_di?: string;
  is_kipk?: boolean | string;
  has_subtipe?: boolean | string;
  override_spa?: number | string;
  override_spp?: number | string;
  override_sks?: number | string;
  spp_per_bulan?: number | string;
  biaya_kemahasiswaan?: number | string;
  ada_biaya_sks?: boolean | string;
  catatan_biaya_jalur?: string;
  warna_icon?: string;
  icon_url?: string;
  icon_emoji?: string;
}

export interface Mitra extends SheetRecord {
  id: string;
  nama: string;
  deskripsi?: string;
  prodi_tersedia?: string;
  warna_icon?: string;
  icon_url?: string;
  icon_emoji?: string;
}

export interface Prodi extends SheetRecord {
  id: string;
  nama: string;
  jenjang?: string;
  deskripsi_singkat?: string;
  warna?: string;
  spp_per_sem?: number | string;
  tersedia_karyawan?: boolean | string;
  tersedia_rpl?: boolean | string;
  filter_tab?: string;
  icon_url?: string;
  icon_emoji?: string;
  foto_url?: string;
}

export interface Biaya extends SheetRecord {
  spa_normal?: number | string;
  spa_setelah_potongan?: number | string;
  spp_tetap?: number | string;
  spp_per_sks?: number | string;
  aanvullen?: number | string;
}

export interface Cicilan extends SheetRecord {
  id?: string | number;
  label: string;
  persen_bayar: number | string;
  deskripsi?: string;
  batas_hari_sejak_daftar?: number | string;
  tanggal_tetap?: string;
  catatan?: string;
}

export interface Beasiswa extends SheetRecord {
  id?: string;
  nama: string;
  penyelenggara?: string;
  deskripsi?: string;
  manfaat?: string;
  warna?: string;
  link_daftar?: string;
  icon_url?: string;
  icon_emoji?: string;
}

export interface RplSubtipe extends SheetRecord {
  id: string;
  nama: string;
  deskripsi?: string;
  spp_per_bulan?: number | string;
  aanvullen_per_sks?: number | string;
  catatan_biaya?: string;
}

export interface PmbData {
  config?: Record<string, Primitive>;
  teks_ui?: Record<string, Primitive>;
  gelombang?: Gelombang[];
  skema?: Skema[];
  prodi?: Prodi[];
  jalur?: Jalur[];
  mitra?: Mitra[];
  biaya_spa?: Record<string, Record<string, Biaya>>;
  cicilan?: Cicilan[];
  beasiswa?: Beasiswa[];
  footer?: Record<string, Primitive>;
  sosmed?: SheetRecord[];
  rpl_subtipe?: RplSubtipe[];
  prov_kab?: Record<string, string[]>;
  jurusan_sma?: string[];
  verif_config?: {
    email_enabled?: boolean | string;
    wa_enabled?: boolean | string;
  };
}

export interface SelectedJalur {
  id: string;
  nama: string;
  isKIPK?: boolean;
  isKaryawan?: boolean;
  sppPerBulan?: number;
  aanvulenPerSks?: number;
  rplSubtipe?: {
    id: string;
    nama: string;
    data?: RplSubtipe;
  } | null;
}

export interface SelectionState {
  gel: string | number | null;
  skema: { id: string; nama: string } | null;
  mitra: { id: string; nama: string; data?: Mitra } | null;
  jalur: SelectedJalur | null;
  prodi: string | null;
}

export interface SchoolSearchResult {
  npsn: string;
  nama_sekolah: string;
  kabupaten?: string;
  provinsi?: string;
}

export interface ApiResult {
  success?: boolean;
  skipped?: boolean;
  valid?: boolean;
  no_daftar?: string;
  error?: string;
  cooldown?: boolean;
}
