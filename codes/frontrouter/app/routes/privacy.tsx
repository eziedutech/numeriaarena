import type { Route } from "./+types/privacy";
import { CONTACT, PaperPage, useLang } from "../legal";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Privacy - Numeria Arena" },
    { name: "description", content: "What Numeria Arena keeps, who can see it, why, and how to have it deleted." },
  ];
}

const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

function English() {
  return (
    <>
      <p>
        Numeria Arena is a maths game for primary school children in grade 4 to 6, made by EZI Edutech ("we"). It is
        played by children, so we keep as little as we can and say plainly what that is. This page explains what we keep,
        who can see it, why, how long we keep it, and how to have it deleted. Questions: {mail}.
      </p>

      <h2>At a glance</h2>
      <ul>
        <li>Children never give us a real name, an email address, a photo or their voice.</li>
        <li>Without a class, play stays on the device. With a class, the server keeps a made-up name and the answers.</li>
        <li>Real names of students stay in the teacher's own browser and are never sent to us.</li>
        <li>No advertising, no selling of data, no tracking, no chat between players, no cookies.</li>
        <li>What the headset and the smartboard camera see is read on the device only, never recorded or sent.</li>
        <li>AI is used only when a teacher asks, and it receives numbers and seat numbers, never a name.</li>
      </ul>

      <h2>1. Playing without a class</h2>
      <p>
        Anyone can play without an account. Progress, settings, the town and the answers stay in this browser on this
        device and are not sent to us. The game still talks to our server to check for a new version and, when you open
        the leaderboard, to read it; like any website, the server sees the device's internet address when it does (see
        section 11).
      </p>

      <h2>2. Students in a class</h2>
      <p>
        A teacher sets up a class and gives each student a card with a class code, a seat number and three pictures. The
        student signs in with those, never with a name or an email. For each seat we keep:
      </p>
      <ul>
        <li>a made-up player name (like BLUE CRANE 07), the seat number and the class's label, grade and school year;</li>
        <li>the picture password, stored only as a salted hash, and a sign-in key for the device, also stored as a hash and valid for 30 days;</li>
        <li>
          each answer: the skill, the kind of question, right or wrong, which try it was, how long it took and, for a
          wrong answer, the kind of mistake it shows; a random code made by the device, not linked to the child, keeps
          answers from being counted twice;
        </li>
        <li>results of games and races: points, place, stars, and when they were played;</li>
        <li>the seat's Fold Town: its land on the class map, what was built and when;</li>
        <li>when the seat last signed in, and counts of wrong picture tries, which lock the seat for a while to stop guessing.</li>
      </ul>
      <p>
        Real names can be typed by the teacher on the teacher page. They are kept only in that teacher's browser, shown
        there and in files the teacher downloads, and are never sent to us.
      </p>

      <h2>3. Who can see what</h2>
      <ul>
        <li>
          <strong>The teacher</strong> sees only their own classes: seats, answers, reports and towns.
        </li>
        <li>
          <strong>Classmates</strong> see each other's made-up names in class races, on the class leaderboard and on the
          class town map.
        </li>
        <li>
          <strong>The global leaderboard</strong> is public. It shows a made-up name, the class's grade and a score, never
          a real name, school, class label or country. A class appears on it unless its teacher turns that off on the
          teacher page.
        </li>
        <li>
          <strong>FIND A RIVAL</strong> pairs a student with another student of the same grade, who may be from another
          school. Each sees only the other's made-up name and score. A watch code lets anyone who has it watch a race,
          with the same made-up names and scores.
        </li>
        <li>
          <strong>On the smartboard</strong>, names come from the teacher's browser and stay on that screen. When the
          teacher saves a race, the server receives seat numbers and answers only.
        </li>
        <li>
          <strong>Our admins</strong> can reach the server's data to run and fix the service; their decisions about
          teacher accounts are written to a log.
        </li>
      </ul>

      <h2>4. Teachers and organisers who sign in</h2>
      <p>
        Adults sign in with Google, Facebook or a link sent by email, through Firebase Authentication (a Google service);
        the email link is sent by that service. We keep your name, email address, the sign-in method, when you last signed
        in, the school or club you enter (its name, kind and country), whether your account is approved, and when you
        agreed to the organiser statement. From Facebook we ask only for your public profile and email address. Changes
        you make to seats and classes are written to a log so that they can be checked later.
      </p>
      <p>
        TRY THE TEACHER PAGE opens a sample teacher with a sample class and made-up data, without signing in. It is
        removed after 24 hours.
      </p>

      <h2>5. AI in the class report</h2>
      <p>
        The AI insights and the AI practice plan are made only when a teacher presses the button. Our server then sends
        an AI model numbers worked out from the answers: for each skill, the first tries right and in all, the kinds of
        mistakes and how often they happened, and seat numbers. It never sends a name, a made-up name, the class label,
        the school or the teacher. Only AI services our admin has approved for this kind of data receive it, and they may
        work outside your country. We keep the result to show it again, and a record of each request (which service,
        cost, time taken, whether it worked), but not the request itself. AI suggestions help the teacher; they decide
        nothing about a child on their own, and the page asks the teacher to check them.
      </p>

      <h2>6. The headset and the smartboard camera</h2>
      <p>
        In the headset the game uses its view of your room, the shape of tables and walls, and your hands, only on the
        device: to place the book on a table and to let you play with your hands. We never record or send camera images,
        room scans, hand movements or voice.
      </p>
      <p>
        On the smartboard, the teacher can turn on CAMERA for one race. The board's camera then looks for raised hands,
        and the picture is read on that device only; no picture, video or hand point is sent or kept, and no sound is
        used. A CAMERA ON chip shows while it runs. The hand reader comes from our own server, not from another service.
      </p>

      <h2>7. Read aloud</h2>
      <p>
        READ ALOUD speaks each question with the browser's own voice. Some browsers make that voice on their maker's
        servers, in which case the text of the question goes there. The question holds no personal data. To avoid it,
        leave READ ALOUD off, or use a browser with voices on the device.
      </p>

      <h2>8. What stays on the device</h2>
      <p>The game and this site keep these in the browser, on the device only:</p>
      <ul>
        <li>language, sound, music, room and accessibility settings (BIG NUMBERS, NO TIMER, HIGH CONTRAST, READ ALOUD, STEADY AIM);</li>
        <li>best scores, which how-to hands were shown, and where an unfinished race stopped;</li>
        <li>a guest's Fold Town and recent plays;</li>
        <li>answers waiting to be sent to a class seat when the network is back, and any the server refused;</li>
        <li>the class seat's sign-in for 30 days, or a teacher's sign-in kept by Firebase Authentication;</li>
        <li>a copy of the game's own files so it can start without a network.</li>
      </ul>
      <p>We use no cookies. Clearing this site's data in the browser removes all of the above.</p>

      <h2>9. What we do not do</h2>
      <ul>
        <li>No advertising, and no selling, renting or sharing of data for marketing.</li>
        <li>No third-party analytics, tracking or profiling.</li>
        <li>No chat or messages between players; watchers can only send a cheer.</li>
        <li>No collecting of real names, email addresses, photos, voice or location from children.</li>
      </ul>

      <h2>10. Who helps us</h2>
      <ul>
        <li>Our own server, on hosting we rent, which stores the class and teacher data above in our database.</li>
        <li>Firebase Authentication (Google), for teacher sign-in and email links only.</li>
        <li>Facebook Login (Meta), only if a teacher chooses it.</li>
        <li>The AI services our admin has set up, for section 5 only, receiving numbers and seat numbers only.</li>
      </ul>
      <p>The site's letters and the game's files come from our own server; no font or file service sees who visits.</p>

      <h2>11. Why we use data</h2>
      <ul>
        <li>To run classes for the school or organiser who set them up, and to show teachers how their students are doing.</li>
        <li>To let teachers sign in and keep their classes theirs.</li>
        <li>To keep the service safe and working: like any website, our web server's technical logs record internet addresses, pages asked for and times, and we use them only to keep the service safe and to fix faults.</li>
      </ul>

      <h2>12. How we keep it safe</h2>
      <ul>
        <li>Every connection uses HTTPS.</li>
        <li>Picture passwords and sign-in keys are stored only as hashes; a seat locks after too many wrong tries.</li>
        <li>A teacher's data can be read only by that teacher once signed in, and by our admins.</li>
        <li>Keys for AI services are stored encrypted.</li>
      </ul>

      <h2>13. How long we keep it</h2>
      <ul>
        <li>On the device: until the site's data is cleared in the browser.</li>
        <li>
          A class: while it exists. When a teacher removes a class it is archived: its code stops working and every
          device signs out, and the teacher can still read its reports. To delete it for good, write to us.
        </li>
        <li>
          A seat emptied for a new student loses the last student's answers, results, town and AI suggestions, and gets
          a new made-up name and picture password.
        </li>
        <li>A teacher's account and classes: until the teacher asks us to delete them; we do so within 30 days.</li>
        <li>A live race room closes when its race ends, after 10 minutes without play, or after 2 hours at most.</li>
      </ul>

      <h2 id="parents">14. For parents</h2>
      <p>
        Numeria Arena is made for children. A child can play without any account, and progress then stays on the device.
        In a class, the school or organiser who set it up is responsible for the children in it: every organiser agrees,
        before making classes, that they will get parental permission as their local rules require. The child's card
        holds a made-up name; the link between that name and the child is known only to the teacher.
      </p>
      <p>
        You can ask the teacher, or us at {mail} with the class code and seat number, to see what is kept for your child,
        to correct it, or to delete it. No name is needed.
      </p>

      <h2>15. Your rights</h2>
      <p>
        Depending on where you live, including under Indonesia's personal data protection law, you may ask to see the data
        we keep about you or your child, to correct it, to delete it, or to object to how it is used, and you may complain
        to your data protection authority. Write to {mail}; we reply within 30 days.
      </p>

      <h2>16. Deleting data</h2>
      <p>
        See <a href="/data-deletion">Data deletion</a>, or write to {mail}.
      </p>

      <h2>17. Changes</h2>
      <p>If this policy changes, this page changes with it and its date moves. If the organiser statement changes, teachers are asked to agree to it again.</p>
    </>
  );
}

function Indonesian() {
  return (
    <>
      <p>
        Numeria Arena adalah game matematika untuk anak sekolah dasar kelas 4 sampai 6, dibuat oleh EZI Edutech ("kami").
        Karena dimainkan anak-anak, kami menyimpan sesedikit mungkin dan menjelaskannya dengan terus terang. Halaman ini
        menjelaskan apa yang kami simpan, siapa yang bisa melihatnya, untuk apa, berapa lama, dan cara menghapusnya.
        Pertanyaan: {mail}.
      </p>

      <h2>Ringkasnya</h2>
      <ul>
        <li>Anak tidak pernah memberi kami nama asli, alamat email, foto, atau suaranya.</li>
        <li>Tanpa kelas, permainan tetap di perangkat. Dengan kelas, server menyimpan nama samaran dan jawabannya.</li>
        <li>Nama asli siswa tetap di browser guru sendiri dan tidak pernah dikirim ke kami.</li>
        <li>Tanpa iklan, tanpa jual data, tanpa pelacakan, tanpa obrolan antarpemain, tanpa cookie.</li>
        <li>Yang dilihat headset dan kamera smartboard dibaca di perangkat saja, tidak pernah direkam atau dikirim.</li>
        <li>AI dipakai hanya bila guru memintanya, dan hanya menerima angka dan nomor kursi, tidak pernah nama.</li>
      </ul>

      <h2>1. Bermain tanpa kelas</h2>
      <p>
        Siapa pun bisa bermain tanpa akun. Progres, pengaturan, kota, dan jawaban tetap di browser ini di perangkat ini
        dan tidak dikirim ke kami. Game tetap menghubungi server kami untuk memeriksa versi baru dan, saat papan peringkat
        dibuka, untuk membacanya; seperti situs web mana pun, server melihat alamat internet perangkat saat itu (lihat
        bagian 11).
      </p>

      <h2>2. Siswa di sebuah kelas</h2>
      <p>
        Guru membuat kelas dan memberi setiap siswa kartu berisi kode kelas, nomor kursi, dan tiga gambar. Siswa masuk
        dengan itu, tidak pernah dengan nama atau email. Untuk setiap kursi kami menyimpan:
      </p>
      <ul>
        <li>nama pemain samaran (misalnya BLUE CRANE 07), nomor kursi, serta label, tingkat, dan tahun ajaran kelasnya;</li>
        <li>sandi gambar, yang hanya disimpan sebagai hash bergaram, dan kunci masuk perangkat, juga sebagai hash dan berlaku 30 hari;</li>
        <li>
          setiap jawaban: keterampilannya, jenis soal, benar atau salah, percobaan keberapa, lama menjawab, dan untuk
          jawaban salah, jenis kekeliruan yang tampak; kode acak buatan perangkat, yang tidak terhubung dengan anak,
          menjaga agar jawaban tidak terhitung dua kali;
        </li>
        <li>hasil game dan lomba: poin, peringkat, bintang, dan waktu bermainnya;</li>
        <li>Kota Lipat milik kursi itu: lahannya di peta kelas, apa yang dibangun, dan kapan;</li>
        <li>waktu terakhir kursi masuk, dan hitungan sandi gambar yang salah, yang mengunci kursi sebentar agar tidak bisa ditebak.</li>
      </ul>
      <p>
        Nama asli bisa diketik guru di halaman guru. Nama itu hanya disimpan di browser guru tersebut, ditampilkan di sana
        dan di berkas yang diunduh guru, dan tidak pernah dikirim ke kami.
      </p>

      <h2>3. Siapa melihat apa</h2>
      <ul>
        <li>
          <strong>Guru</strong> hanya melihat kelasnya sendiri: kursi, jawaban, laporan, dan kota.
        </li>
        <li>
          <strong>Teman sekelas</strong> melihat nama samaran satu sama lain di lomba kelas, papan peringkat kelas, dan
          peta kota kelas.
        </li>
        <li>
          <strong>Papan peringkat global</strong> terbuka untuk umum. Isinya nama samaran, tingkat kelas, dan skor, tidak
          pernah nama asli, sekolah, label kelas, atau negara. Sebuah kelas tampil di sana kecuali gurunya mematikannya di
          halaman guru.
        </li>
        <li>
          <strong>CARI LAWAN</strong> memasangkan siswa dengan siswa lain satu tingkat, yang bisa dari sekolah lain.
          Masing-masing hanya melihat nama samaran dan skor lawannya. Kode tonton memungkinkan siapa pun yang memilikinya
          menonton lomba, dengan nama samaran dan skor yang sama.
        </li>
        <li>
          <strong>Di smartboard</strong>, nama diambil dari browser guru dan tetap di layar itu. Saat guru menyimpan
          lomba, server hanya menerima nomor kursi dan jawaban.
        </li>
        <li>
          <strong>Admin kami</strong> dapat menjangkau data server untuk menjalankan dan memperbaiki layanan; keputusan
          mereka tentang akun guru dicatat.
        </li>
      </ul>

      <h2>4. Guru dan penyelenggara yang masuk</h2>
      <p>
        Orang dewasa masuk dengan Google, Facebook, atau tautan lewat email, melalui Firebase Authentication (layanan
        Google); tautan email dikirim oleh layanan itu. Kami menyimpan nama, alamat email, cara masuk, waktu terakhir masuk,
        sekolah atau klub yang Anda isi (nama, jenis, dan negaranya), status persetujuan akun, dan waktu Anda menyetujui
        pernyataan penyelenggara. Dari Facebook kami hanya meminta profil publik dan alamat email. Perubahan yang Anda buat
        pada kursi dan kelas dicatat agar bisa diperiksa kemudian.
      </p>
      <p>
        COBA HALAMAN GURU membuka guru contoh dengan kelas contoh dan data karangan, tanpa masuk. Guru contoh dihapus
        setelah 24 jam.
      </p>

      <h2>5. AI di laporan kelas</h2>
      <p>
        Wawasan AI dan rencana latihan AI hanya dibuat saat guru menekan tombolnya. Server kami lalu mengirim ke model AI
        angka yang dihitung dari jawaban: untuk setiap keterampilan, percobaan pertama yang benar dan seluruhnya, jenis
        kekeliruan dan seberapa sering terjadi, serta nomor kursi. Server tidak pernah mengirim nama, nama samaran, label
        kelas, sekolah, atau guru. Hanya layanan AI yang disetujui admin kami untuk data seperti ini yang menerimanya, dan
        layanan itu bisa bekerja di luar negara Anda. Kami menyimpan hasilnya untuk ditampilkan lagi, serta catatan tiap
        permintaan (layanan mana, biaya, lama, berhasil atau tidak), tetapi tidak menyimpan isi permintaannya. Saran AI
        membantu guru; saran itu tidak memutuskan apa pun tentang anak dengan sendirinya, dan halamannya meminta guru
        memeriksanya.
      </p>

      <h2>6. Headset dan kamera smartboard</h2>
      <p>
        Di headset, game memakai pandangan atas ruangan Anda, bentuk meja dan dinding, serta tangan Anda, hanya di
        perangkat: untuk meletakkan buku di meja dan agar Anda bisa bermain dengan tangan. Kami tidak pernah merekam atau
        mengirim gambar kamera, pindaian ruangan, gerakan tangan, atau suara.
      </p>
      <p>
        Di smartboard, guru bisa menyalakan KAMERA untuk satu lomba. Kamera papan lalu mencari tangan yang terangkat, dan
        gambarnya dibaca di perangkat itu saja; tidak ada gambar, video, atau titik tangan yang dikirim atau disimpan, dan
        suara tidak dipakai. Chip KAMERA AKTIF tampil selama kamera berjalan. Pembaca tangannya diambil dari server kami
        sendiri, bukan dari layanan lain.
      </p>

      <h2>7. Bacakan soal</h2>
      <p>
        BACAKAN SOAL membacakan tiap soal dengan suara bawaan browser. Sebagian browser membuat suara itu di server
        pembuatnya, sehingga teks soal dikirim ke sana. Soal tidak berisi data pribadi. Untuk menghindarinya, biarkan
        BACAKAN SOAL mati, atau pakai browser dengan suara di perangkat.
      </p>

      <h2>8. Yang tetap di perangkat</h2>
      <p>Game dan situs ini menyimpan hal berikut di browser, hanya di perangkat:</p>
      <ul>
        <li>pengaturan bahasa, suara, musik, ruangan, dan aksesibilitas (ANGKA BESAR, TANPA WAKTU, KONTRAS TINGGI, BACAKAN SOAL, BIDIKAN STABIL);</li>
        <li>skor terbaik, panduan tangan yang sudah tampil, dan titik berhenti lomba yang belum selesai;</li>
        <li>Kota Lipat dan permainan terakhir milik tamu;</li>
        <li>jawaban yang menunggu dikirim ke kursi kelas saat jaringan kembali, dan yang ditolak server;</li>
        <li>status masuk kursi kelas selama 30 hari, atau status masuk guru yang disimpan Firebase Authentication;</li>
        <li>salinan berkas game agar bisa dibuka tanpa jaringan.</li>
      </ul>
      <p>Kami tidak memakai cookie. Menghapus data situs ini di browser menghapus semua hal di atas.</p>

      <h2>9. Yang tidak kami lakukan</h2>
      <ul>
        <li>Tidak ada iklan, dan tidak ada data yang dijual, disewakan, atau dibagikan untuk pemasaran.</li>
        <li>Tidak ada analitik, pelacakan, atau pembuatan profil oleh pihak ketiga.</li>
        <li>Tidak ada obrolan atau pesan antarpemain; penonton hanya bisa mengirim sorakan.</li>
        <li>Tidak mengumpulkan nama asli, alamat email, foto, suara, atau lokasi anak.</li>
      </ul>

      <h2>10. Yang membantu kami</h2>
      <ul>
        <li>Server kami sendiri, di hosting yang kami sewa, yang menyimpan data kelas dan guru di atas di basis data kami.</li>
        <li>Firebase Authentication (Google), hanya untuk masuk guru dan tautan email.</li>
        <li>Facebook Login (Meta), hanya bila guru memilihnya.</li>
        <li>Layanan AI yang disiapkan admin kami, hanya untuk bagian 5, dan hanya menerima angka dan nomor kursi.</li>
      </ul>
      <p>Huruf situs dan berkas game diambil dari server kami sendiri; tidak ada layanan huruf atau berkas yang melihat pengunjung.</p>

      <h2>11. Untuk apa data dipakai</h2>
      <ul>
        <li>Menjalankan kelas bagi sekolah atau penyelenggara yang membuatnya, dan memperlihatkan perkembangan siswa kepada guru.</li>
        <li>Memungkinkan guru masuk dan menjaga kelasnya tetap miliknya.</li>
        <li>Menjaga layanan tetap aman dan berjalan: seperti situs web mana pun, log teknis server web mencatat alamat internet, halaman yang diminta, dan waktunya, dan kami memakainya hanya untuk keamanan dan memperbaiki gangguan.</li>
      </ul>

      <h2>12. Cara kami menjaganya</h2>
      <ul>
        <li>Setiap koneksi memakai HTTPS.</li>
        <li>Sandi gambar dan kunci masuk hanya disimpan sebagai hash; kursi terkunci setelah terlalu banyak percobaan salah.</li>
        <li>Data seorang guru hanya bisa dibaca guru itu setelah masuk, dan oleh admin kami.</li>
        <li>Kunci layanan AI disimpan terenkripsi.</li>
      </ul>

      <h2>13. Berapa lama disimpan</h2>
      <ul>
        <li>Di perangkat: sampai data situs dihapus di browser.</li>
        <li>
          Kelas: selama kelas itu ada. Saat guru menghapus kelas, kelas itu diarsipkan: kodenya berhenti berlaku dan semua
          perangkat keluar, dan guru masih bisa membaca laporannya. Untuk menghapusnya sama sekali, tulis ke kami.
        </li>
        <li>
          Kursi yang dikosongkan untuk siswa baru kehilangan jawaban, hasil, kota, dan saran AI siswa sebelumnya, lalu
          mendapat nama samaran dan sandi gambar baru.
        </li>
        <li>Akun dan kelas guru: sampai guru meminta kami menghapusnya; kami melakukannya dalam 30 hari.</li>
        <li>Ruang lomba langsung tertutup saat lombanya selesai, setelah 10 menit tanpa permainan, atau paling lama 2 jam.</li>
      </ul>

      <h2 id="parents">14. Untuk orang tua</h2>
      <p>
        Numeria Arena dibuat untuk anak-anak. Anak bisa bermain tanpa akun apa pun, dan progresnya tetap di perangkat.
        Di sebuah kelas, sekolah atau penyelenggara yang membuatnya bertanggung jawab atas anak-anak di dalamnya: setiap
        penyelenggara menyatakan, sebelum membuat kelas, bahwa mereka akan meminta izin orang tua sesuai aturan setempat.
        Kartu anak berisi nama samaran; hubungan antara nama itu dan anaknya hanya diketahui guru.
      </p>
      <p>
        Anda bisa meminta guru, atau kami di {mail} dengan kode kelas dan nomor kursi, untuk melihat apa yang disimpan
        tentang anak Anda, memperbaikinya, atau menghapusnya. Nama tidak diperlukan.
      </p>

      <h2>15. Hak Anda</h2>
      <p>
        Sesuai tempat tinggal Anda, termasuk menurut Undang-Undang Pelindungan Data Pribadi di Indonesia, Anda dapat
        meminta untuk melihat data yang kami simpan tentang Anda atau anak Anda, memperbaikinya, menghapusnya, atau
        menolak cara pemakaiannya, dan Anda dapat mengadu ke otoritas pelindungan data. Tulis ke {mail}; kami membalas
        dalam 30 hari.
      </p>

      <h2>16. Menghapus data</h2>
      <p>
        Lihat <a href="/data-deletion">Penghapusan data</a>, atau tulis ke {mail}.
      </p>

      <h2>17. Perubahan</h2>
      <p>
        Bila kebijakan ini berubah, halaman ini ikut berubah dan tanggalnya diperbarui. Bila pernyataan penyelenggara
        berubah, guru diminta menyetujuinya lagi.
      </p>
    </>
  );
}

export default function Privacy() {
  const [lang, setLang] = useLang();
  return (
    <PaperPage lang={lang} setLang={setLang} title={lang === "id" ? "PRIVASI" : "PRIVACY"}>
      {lang === "id" ? <Indonesian /> : <English />}
    </PaperPage>
  );
}
