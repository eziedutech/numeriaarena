/**
 * Text of the home page in English (default) and Indonesian. Headings and
 * card titles are capitals, drawn with the paper letters.
 */
export type Lang = 'en' | 'id';

const EN = {
  playOn: 'PLAY ON',
  device: { computer: 'THIS COMPUTER', xr: 'HEADSET (XR)', smartboard: 'SMARTBOARD' },
  language: 'LANGUAGE',
  accessibility: 'ACCESSIBILITY',
  hint: {
    computer: 'Pick where you play first. This computer plays with the mouse; the headset opens the game on your real desk.',
    xr: 'The game opens on your real desk. Put the headset on and play with your hands.',
    smartboard: 'Touch the big screen to play. The class helper mode for smartboards is coming soon.',
  },
  noXr: 'No headset found on this device',
  play: 'PLAY',
  you: 'YOU',
  practice: ['PRACTICE ON MY OWN', 'No timer, your own pace'],
  robots: ['RACE THE ROBOTS', 'Two robot rivals, 3 timed waves'],
  classmates: ['RACE MY CLASSMATES', 'Same class, real time'],
  smartboard: ['PLAY ON THE SMARTBOARD', 'Help the headset players as a class'],
  studentFirst: 'Enter your student code first',
  student: ['ENTER STUDENT CODE', 'Class code, seat and picture password'],
  teacher: ['TEACHER SIGN IN', 'Classes, rooms and reports'],
  tips: ['MATH TIPS', 'Ways to understand primary maths'],
  watch: ['WATCH A MATCH', 'With a watch code, or the demo match'],
  soon: 'SOON',
  footer: ['How to play', 'For parents', 'Privacy', 'Credits and licenses', 'About'],
  close: 'CLOSE',
  cancel: 'CANCEL',
  go: 'GO',
  classCode: '1. Class code (on your card or the class screen)',
  seat: '2. Your seat number',
  picture: '3. Your picture password (3 pictures)',
  serverSoon:
    'Class sign-in opens when the class server is ready. Until then you can practise and race the robots without signing in.',
  teacherIntro: 'For teachers and club organisers. Students never sign in here.',
  google: 'Continue with Google',
  facebook: 'Continue with Facebook',
  email: 'EMAIL ME A SIGN-IN LINK',
  soonBody: {
    tips: 'Short lessons and tips for every topic in the game are on their way.',
    watch: 'Watching a class match with a watch code, and the always-on demo match, come with the class server.',
    smartboard: 'On a smartboard the whole class helps the headset players. This mode is coming in a later update.',
    accessibility:
      'Coming next: one-handed play, no timer, high contrast, larger numbers, read the question aloud, and steadier aim. Until then every game can be played with one hand.',
  },
  pages: {
    'How to play':
      'Pick PRACTICE ON MY OWN or RACE THE ROBOTS. A paper animal walks out of the book with a question. Pop the balloon with the right answer, or join two crystals that make the number it asks for. Right answers send it home happy.',
    'For parents':
      'Children play without an account. Progress stays on this device. When a teacher sets up a class, children sign in with a class code and a picture password, never with a name or an email. Teachers see only their own class.',
    Privacy:
      'We keep as little as we can. Without a class, nothing leaves this device. With a class, the server keeps a made-up player name (like BLUE CRANE 07) and the answers given, never a real name, email, photo, voice, or what the headset cameras see.',
    'Credits and licenses':
      'Built with the Immersive Web SDK (MIT) and three.js (MIT). Paper animals, letters and pictures are made by the project owner. Every third-party part is listed with its license in the source repository.',
    About: 'Numeria Arena is a mixed reality maths game for children aged 10 to 12: a pop-up book opens on your real desk and paper animals bring you questions.',
  },
};

const ID: typeof EN = {
  playOn: 'MAIN DI',
  device: { computer: 'KOMPUTER INI', xr: 'HEADSET (XR)', smartboard: 'SMARTBOARD' },
  language: 'BAHASA',
  accessibility: 'AKSESIBILITAS',
  hint: {
    computer: 'Pilih dulu tempat bermain. Komputer ini dimainkan dengan mouse; headset membuka game di mejamu sendiri.',
    xr: 'Game terbuka di mejamu sendiri. Pakai headset dan bermain dengan tangan.',
    smartboard: 'Sentuh layar besar untuk bermain. Mode pembantu kelas untuk smartboard segera hadir.',
  },
  noXr: 'Headset tidak ditemukan di perangkat ini',
  play: 'MAIN',
  you: 'KAMU',
  practice: ['BERLATIH SENDIRI', 'Tanpa waktu, sesuai kecepatanmu'],
  robots: ['LOMBA LAWAN ROBOT', 'Dua robot, 3 gelombang berwaktu'],
  classmates: ['LOMBA DENGAN TEMAN', 'Satu kelas, langsung'],
  smartboard: ['MAIN DI SMARTBOARD', 'Bantu pemain headset bersama kelas'],
  studentFirst: 'Masukkan kode siswa dulu',
  student: ['MASUKKAN KODE SISWA', 'Kode kelas, kursi, dan sandi gambar'],
  teacher: ['MASUK SEBAGAI GURU', 'Kelas, ruang main, dan laporan'],
  tips: ['TIPS MATEMATIKA', 'Cara memahami matematika SD'],
  watch: ['TONTON PERTANDINGAN', 'Dengan kode tonton, atau pertandingan demo'],
  soon: 'SEGERA',
  footer: ['Cara bermain', 'Untuk orang tua', 'Privasi', 'Kredit dan lisensi', 'Tentang'],
  close: 'TUTUP',
  cancel: 'BATAL',
  go: 'MASUK',
  classCode: '1. Kode kelas (di kartumu atau di layar kelas)',
  seat: '2. Nomor kursimu',
  picture: '3. Sandi gambarmu (3 gambar)',
  serverSoon:
    'Masuk kelas dibuka saat server kelas siap. Sampai saat itu kamu tetap bisa berlatih dan lomba melawan robot tanpa masuk.',
  teacherIntro: 'Untuk guru dan pembina klub. Siswa tidak pernah masuk di sini.',
  google: 'Lanjut dengan Google',
  facebook: 'Lanjut dengan Facebook',
  email: 'KIRIM TAUTAN MASUK KE EMAIL',
  soonBody: {
    tips: 'Pelajaran singkat dan tips untuk setiap topik di game sedang disiapkan.',
    watch: 'Menonton pertandingan kelas dengan kode tonton, dan pertandingan demo, hadir bersama server kelas.',
    smartboard: 'Di smartboard, seluruh kelas membantu pemain headset. Mode ini hadir di pembaruan berikutnya.',
    accessibility:
      'Segera: main satu tangan, tanpa waktu, kontras tinggi, angka lebih besar, soal dibacakan, dan bidikan lebih stabil. Saat ini semua game sudah bisa dimainkan dengan satu tangan.',
  },
  pages: {
    'How to play':
      'Pilih BERLATIH SENDIRI atau LOMBA LAWAN ROBOT. Hewan kertas keluar dari buku membawa soal. Pecahkan balon berisi jawaban yang benar, atau gabungkan dua kristal yang hasilnya sama dengan angka yang diminta. Jawaban benar membuatnya pulang dengan gembira.',
    'For parents':
      'Anak bermain tanpa akun. Progres tersimpan di perangkat ini. Bila guru membuat kelas, anak masuk dengan kode kelas dan sandi gambar, tidak pernah dengan nama atau email. Guru hanya melihat kelasnya sendiri.',
    Privacy:
      'Kami menyimpan sesedikit mungkin. Tanpa kelas, tidak ada data yang keluar dari perangkat ini. Dengan kelas, server menyimpan nama pemain samaran (misalnya BLUE CRANE 07) dan jawaban, tidak pernah nama asli, email, foto, suara, atau apa yang dilihat kamera headset.',
    'Credits and licenses':
      'Dibangun dengan Immersive Web SDK (MIT) dan three.js (MIT). Hewan kertas, huruf, dan gambar dibuat oleh pemilik proyek. Setiap bagian pihak ketiga tercatat bersama lisensinya di repositori sumber.',
    About: 'Numeria Arena adalah game matematika mixed reality untuk anak 10 sampai 12 tahun: buku pop-up terbuka di mejamu dan hewan kertas membawakan soal.',
  },
};

export const HOME_TEXT: Record<Lang, typeof EN> = { en: EN, id: ID };
export type HomeText = typeof EN;
