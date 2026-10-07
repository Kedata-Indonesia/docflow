/**
 * Sample data for the playground — the "host app" side of the contract.
 *
 * Everything here is what a real consumer would feed the library: a ProseMirror
 * document, comment threads, version snapshots and collaborators. The library
 * never fetches this data itself (see docs/LIBRARY_CONTRACT.md).
 */

import type { Collaborator, CommentItem, DocumentSnapshot } from '@kedata-indonesia/docflow-vue'

// ---------------------------------------------------------------------------
// ProseMirror document helpers
// ---------------------------------------------------------------------------

export interface PmMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface PmNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PmNode[]
  text?: string
  marks?: PmMark[]
}

export interface PmDoc {
  type: 'doc'
  content: PmNode[]
}

const t = (text: string, marks?: PmMark[]): PmNode => (marks ? { type: 'text', text, marks } : { type: 'text', text })
const bold = (text: string): PmNode => t(text, [{ type: 'bold' }])

const h = (level: number, text: string): PmNode => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const p = (text: string): PmNode => ({ type: 'paragraph', content: text ? [t(text)] : [] })
const lead = (text: string): PmNode => ({ type: 'paragraph', content: [bold(text)] })
const ul = (...items: string[]): PmNode => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [p(item)] })),
})
const ol = (...items: string[]): PmNode => ({
  type: 'orderedList',
  content: items.map((item) => ({ type: 'listItem', content: [p(item)] })),
})
const quote = (text: string): PmNode => ({ type: 'blockquote', content: [p(text)] })
const doc = (...blocks: PmNode[]): PmDoc => ({ type: 'doc', content: blocks })

// ---------------------------------------------------------------------------
// Document presets
// ---------------------------------------------------------------------------

export type PresetId = 'surat' | 'kontrak' | 'laporan'

export interface Preset {
  title: string
  doc: PmDoc
}

const surat = doc(
  h(1, 'PT Nusantara Cakrawala'),
  p('Jalan Merdeka No. 45, Bandung 40115 · (022) 555-0147 · halo@nusantaracakrawala.co.id'),
  p(''),
  p('Bandung, 7 Oktober 2026'),
  p('Nomor: 214/NC/X/2026'),
  p('Perihal: Undangan Rapat Koordinasi Triwulan IV'),
  p(''),
  p('Kepada Yth. Kepala Divisi Operasional'),
  p('di tempat'),
  p(''),
  p('Dengan hormat,'),
  p(
    'Sehubungan dengan berakhirnya triwulan III tahun anggaran 2026, kami mengundang Bapak/Ibu untuk menghadiri rapat koordinasi dengan agenda sebagai berikut.',
  ),
  ol(
    'Evaluasi capaian kinerja triwulan III dan deviasi terhadap target RKAP.',
    'Rekonsiliasi laporan keuangan serta temuan audit internal.',
    'Penyusunan rencana kerja dan kebutuhan anggaran triwulan IV.',
    'Penetapan indikator kinerja tambahan untuk fungsi layanan pelanggan.',
  ),
  p(''),
  lead('Waktu dan tempat'),
  ul(
    'Hari/Tanggal: Senin, 12 Oktober 2026',
    'Waktu: 09.00 – 12.00 WIB',
    'Tempat: Ruang Rapat Utama, Lantai 8, Gedung Nusantara',
    'Mode daring: tautan akan dibagikan melalui surat elektronik sehari sebelumnya',
  ),
  p(''),
  p(
    'Mengingat pentingnya agenda ini, kami mengharapkan kehadiran Bapak/Ibu tepat waktu beserta bahan paparan masing-masing unit yang diserahkan paling lambat Jumat, 9 Oktober 2026 pukul 15.00 WIB.',
  ),
  p(
    'Demikian undangan ini kami sampaikan. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.',
  ),
  p(''),
  p('Hormat kami,'),
  p(''),
  lead('Rani Prameswari'),
  p('Direktur Operasional'),
)

const kontrak = doc(
  h(1, 'Perjanjian Kerja Sama Penyediaan Layanan Perangkat Lunak'),
  p('Nomor: 088/PKS/X/2026'),
  p(''),
  lead('Para Pihak'),
  p(
    'Perjanjian ini dibuat dan ditandatangani pada hari Rabu, 7 Oktober 2026, oleh dan antara pihak-pihak berikut.',
  ),
  ol(
    'PT Nusantara Cakrawala, berkedudukan di Bandung, diwakili oleh Rani Prameswari selaku Direktur Operasional, selanjutnya disebut PIHAK PERTAMA.',
    'PT Sinar Teknologi Mandiri, berkedudukan di Jakarta, diwakili oleh Bagas Wicaksana selaku Direktur Utama, selanjutnya disebut PIHAK KEDUA.',
  ),
  p(''),
  lead('Pasal 1 — Ruang Lingkup'),
  p(
    'PIHAK KEDUA menyediakan layanan pengembangan, pemeliharaan, dan dukungan teknis atas perangkat lunak pengelolaan dokumen sebagaimana diuraikan dalam Lampiran I yang tidak terpisahkan dari perjanjian ini.',
  ),
  lead('Pasal 2 — Jangka Waktu'),
  p('Perjanjian ini berlaku untuk jangka waktu 24 bulan terhitung sejak tanggal penandatanganan dan dapat diperpanjang atas kesepakatan tertulis kedua pihak.'),
  lead('Pasal 3 — Nilai dan Cara Pembayaran'),
  ol(
    'Nilai kontrak disepakati sebesar Rp 1.480.000.000 belum termasuk pajak.',
    'Pembayaran dilakukan secara triwulanan berdasarkan berita acara penerimaan pekerjaan.',
    'Keterlambatan pembayaran dikenakan denda 1 persen per bulan dari nilai tagihan tertunggak.',
  ),
  lead('Pasal 4 — Kerahasiaan'),
  p(
    'Kedua pihak wajib menjaga kerahasiaan seluruh informasi teknis dan komersial yang diperoleh selama pelaksanaan perjanjian, termasuk setelah perjanjian berakhir.',
  ),
  lead('Pasal 5 — Keadaan Memaksa'),
  quote(
    'Apabila terjadi keadaan memaksa di luar kendali para pihak, kewajiban yang terdampak ditangguhkan untuk sementara tanpa menimbulkan tuntutan ganti rugi.',
  ),
  lead('Pasal 6 — Penyelesaian Sengketa'),
  p(
    'Sengketa yang timbul diselesaikan terlebih dahulu melalui musyawarah. Apabila tidak tercapai dalam 30 hari, para pihak menyepakati penyelesaian melalui Badan Arbitrase Nasional Indonesia.',
  ),
  p(''),
  p('Demikian perjanjian ini dibuat dalam rangkap dua, masing-masing berkekuatan hukum yang sama.'),
)

const laporan = doc(
  h(1, 'Laporan Kinerja Bulanan — September 2026'),
  p('Unit: Direktorat Operasional · Disusun oleh: Tim Monitoring Kinerja'),
  p(''),
  lead('Ringkasan Eksekutif'),
  p(
    'Kinerja operasional bulan September 2026 menunjukkan perbaikan pada seluruh indikator utama. Waktu proses rata-rata turun menjadi 2,4 hari dari 3,1 hari pada bulan sebelumnya.',
  ),
  lead('Indikator Utama'),
  ul(
    'Volume dokumen diproses: 12.480 berkas, naik 8,2 persen dibandingkan Agustus.',
    'Tingkat ketepatan waktu penyelesaian: 94,6 persen, melampaui target 92 persen.',
    'Tingkat keluhan pelanggan: 0,7 persen dari total transaksi, turun dari 1,1 persen.',
    'Ketersediaan sistem: 99,94 persen dengan dua insiden minor tanpa gangguan layanan.',
  ),
  lead('Kendala'),
  ol(
    'Antrean verifikasi berkas pada pekan ketiga akibat libur nasional dan cuti bersama.',
    'Sinkronisasi data antara sistem lama dan sistem baru belum sepenuhnya otomatis.',
  ),
  lead('Rencana Tindak Lanjut'),
  ul(
    'Menambah dua petugas verifikasi sementara untuk periode puncak Oktober dan Desember.',
    'Menyelesaikan integrasi basis data tahap kedua pada akhir November.',
    'Menyusun prosedur tanggap insiden yang diperbarui bersama tim teknologi.',
  ),
  quote(
    'Catatan: seluruh angka pada laporan ini bersumber dari dasbor monitoring internal dan diverifikasi oleh unit audit pada 3 Oktober 2026.',
  ),
)

export const PRESETS: Record<PresetId, Preset> = {
  surat: { title: 'Surat Undangan Rapat Koordinasi', doc: surat },
  kontrak: { title: 'Perjanjian Kerja Sama Layanan Perangkat Lunak', doc: kontrak },
  laporan: { title: 'Laporan Kinerja Bulanan September 2026', doc: laporan },
}

export const PAGE_SIZE_OPTIONS = [
  { id: 'a4', label: 'A4 — 210 × 297 mm' },
  { id: 'f4', label: 'F4 / Folio — 215 × 330 mm' },
  { id: 'letter', label: 'Letter — 216 × 279 mm' },
  { id: 'legal', label: 'Legal — 216 × 356 mm' },
  { id: 'a5', label: 'A5 — 148 × 210 mm' },
] as const

// ---------------------------------------------------------------------------
// Host-owned side data (comments, versions, collaborators)
// ---------------------------------------------------------------------------

export const SAMPLE_COMMENTS: CommentItem[] = [
  {
    id: 'thread-1',
    authorId: 'user-2',
    authorName: 'Dimas Prasetyo',
    authorColor: '#2563eb',
    content: 'Nomor surat perlu disesuaikan dengan buku agenda tahun ini.',
    anchorText: 'Nomor: 214/NC/X/2026',
    createdAt: Date.now() - 7_200_000,
    replies: [
      {
        id: 'reply-1',
        authorId: 'user-1',
        authorName: 'Reviewer DocFlow',
        authorColor: '#059669',
        content: 'Sudah dicek dengan sekretariat, nomor ini benar.',
        createdAt: Date.now() - 3_600_000,
      },
    ],
  },
  {
    id: 'thread-2',
    authorId: 'user-3',
    authorName: 'Sari Indah',
    authorColor: '#d97706',
    content: 'Tambahkan tautan daring agar peserta luar kota bisa bergabung.',
    createdAt: Date.now() - 86_400_000,
    resolved: true,
    resolvedBy: 'Dimas Prasetyo',
    replies: [],
  },
  {
    id: 'thread-3',
    authorId: 'user-1',
    authorName: 'Reviewer DocFlow',
    authorColor: '#059669',
    content: 'Batas penyerahan bahan paparan sebaiknya ditegaskan dalam butir terpisah.',
    createdAt: Date.now() - 172_800_000,
    replies: [],
  },
]

export const SAMPLE_SNAPSHOTS: DocumentSnapshot[] = [
  {
    versionId: 'ver-3',
    versionIndex: 3,
    title: 'Revisi akhir — siap tanda tangan',
    contentPreview: 'Perjanjian ini dibuat dan ditandatangani pada hari Rabu, 7 Oktober 2026…',
    modifiedBy: 'Reviewer DocFlow',
    timestamp: Date.now() - 1_800_000,
  },
  {
    versionId: 'ver-2',
    versionIndex: 2,
    title: 'Perbaikan Pasal 3',
    contentPreview: 'Nilai kontrak disepakati sebesar Rp 1.480.000.000 belum termasuk pajak…',
    modifiedBy: 'Dimas Prasetyo',
    timestamp: Date.now() - 43_200_000,
  },
  {
    versionId: 'ver-1',
    versionIndex: 1,
    title: 'Draf pertama',
    contentPreview: 'PIHAK KEDUA menyediakan layanan pengembangan, pemeliharaan, dan dukungan…',
    modifiedBy: 'Sari Indah',
    timestamp: Date.now() - 259_200_000,
  },
]

export const SAMPLE_COLLABORATORS: Collaborator[] = [
  { userId: 'user-2', name: 'Dimas Prasetyo', color: '#2563eb' },
  { userId: 'user-3', name: 'Sari Indah', color: '#d97706', isTyping: true },
  { userId: 'user-4', name: 'Bagas Wicaksana', color: '#7c3aed' },
]
