import type { Route } from "./+types/privacy";
import { CONTACT, PaperPage, useLang } from "../legal";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Privacy - Numeria Arena" },
    { name: "description", content: "What Numeria Arena keeps, why, and how to have it deleted." },
  ];
}

const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

function English() {
  return (
    <>
      <p>
        Numeria Arena is a mixed reality maths game for children aged 10 to 12, made by EZI Edutech. We keep as little
        as we can. This page says what we keep, why, and how to have it deleted. Questions: {mail}.
      </p>

      <h2>Playing without a class</h2>
      <p>
        Anyone can play without an account. Progress, settings and answers stay in this browser on this device. Nothing
        is sent to us.
      </p>

      <h2>Students in a class</h2>
      <p>
        When a teacher sets up a class, a student signs in with a class code, a seat number and a picture password,
        never with a name or an email. For the class we keep a made-up player name (like BLUE CRANE 07), the class and
        seat, the picture password stored only as a salted hash, and the answers given with their times. Real names
        stay in the teacher's own browser and are never sent to us. A teacher sees only their own class.
      </p>

      <h2>Teachers and organisers who sign in</h2>
      <p>
        Adults sign in with Google, Facebook or a link sent by email, through Firebase Authentication (a Google
        service). We keep your name, email address, the sign-in method, the school or club you enter (its name, kind
        and country), whether your account is approved, and when you agreed to the organiser statement. From Facebook
        we ask only for your public profile and email address.
      </p>

      <h2>The headset</h2>
      <p>
        The game uses the headset's view of your room only on the device, to find a table for the book and to follow
        your hands. We never record or send camera images, room scans, or voice.
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>No advertising, and no selling or renting of any data.</li>
        <li>No third-party analytics or tracking.</li>
        <li>No chat between players.</li>
      </ul>

      <h2>Who helps us</h2>
      <ul>
        <li>Firebase Authentication (Google), for teacher sign-in only.</li>
        <li>Facebook Login (Meta), only if a teacher chooses it.</li>
        <li>Our own server, which stores the class and teacher data described above.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        A teacher's account and their classes stay until the teacher deletes them or asks us to. A class that a teacher
        deletes takes its students' data with it.
      </p>

      <h2>Deleting your data</h2>
      <p>
        See <a href="/data-deletion">Data deletion</a>, or write to {mail}.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes, this page changes with it and its date moves.</p>
    </>
  );
}

function Indonesian() {
  return (
    <>
      <p>
        Numeria Arena adalah game matematika mixed reality untuk anak 10 sampai 12 tahun, dibuat oleh EZI Edutech. Kami
        menyimpan sesedikit mungkin. Halaman ini menjelaskan apa yang kami simpan, untuk apa, dan cara menghapusnya.
        Pertanyaan: {mail}.
      </p>

      <h2>Bermain tanpa kelas</h2>
      <p>
        Siapa pun bisa bermain tanpa akun. Progres, pengaturan, dan jawaban tersimpan di browser ini di perangkat ini.
        Tidak ada yang dikirim ke kami.
      </p>

      <h2>Siswa di sebuah kelas</h2>
      <p>
        Bila guru membuat kelas, siswa masuk dengan kode kelas, nomor kursi, dan sandi gambar, tidak pernah dengan nama
        atau email. Untuk kelas itu kami menyimpan nama pemain samaran (misalnya BLUE CRANE 07), kelas dan kursi, sandi
        gambar yang hanya disimpan sebagai hash bergaram, serta jawaban beserta waktunya. Nama asli tetap di browser
        guru dan tidak pernah dikirim ke kami. Guru hanya melihat kelasnya sendiri.
      </p>

      <h2>Guru dan penyelenggara yang masuk</h2>
      <p>
        Orang dewasa masuk dengan Google, Facebook, atau tautan yang dikirim lewat email, melalui Firebase
        Authentication (layanan Google). Kami menyimpan nama, alamat email, cara masuk, sekolah atau klub yang Anda isi
        (nama, jenis, dan negaranya), status persetujuan akun, dan waktu Anda menyetujui pernyataan penyelenggara. Dari
        Facebook kami hanya meminta profil publik dan alamat email.
      </p>

      <h2>Headset</h2>
      <p>
        Game memakai pandangan headset atas ruangan Anda hanya di perangkat, untuk menemukan meja bagi buku dan
        mengikuti tangan Anda. Kami tidak pernah merekam atau mengirim gambar kamera, pindaian ruangan, atau suara.
      </p>

      <h2>Yang tidak kami lakukan</h2>
      <ul>
        <li>Tidak ada iklan, dan tidak ada data yang dijual atau disewakan.</li>
        <li>Tidak ada analitik atau pelacakan pihak ketiga.</li>
        <li>Tidak ada obrolan antarpemain.</li>
      </ul>

      <h2>Yang membantu kami</h2>
      <ul>
        <li>Firebase Authentication (Google), hanya untuk masuk guru.</li>
        <li>Facebook Login (Meta), hanya bila guru memilihnya.</li>
        <li>Server kami sendiri, yang menyimpan data kelas dan guru di atas.</li>
      </ul>

      <h2>Berapa lama disimpan</h2>
      <p>
        Akun guru dan kelasnya tersimpan sampai guru menghapusnya atau meminta kami menghapusnya. Kelas yang dihapus
        guru ikut menghapus data siswanya.
      </p>

      <h2>Menghapus data Anda</h2>
      <p>
        Lihat <a href="/data-deletion">Penghapusan data</a>, atau tulis ke {mail}.
      </p>

      <h2>Perubahan</h2>
      <p>Bila kebijakan ini berubah, halaman ini ikut berubah dan tanggalnya diperbarui.</p>
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
