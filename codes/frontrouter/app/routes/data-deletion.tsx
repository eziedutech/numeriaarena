import type { Route } from "./+types/data-deletion";
import { CONTACT, PaperPage, useLang } from "../legal";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Data deletion - Numeria Arena" },
    { name: "description", content: "How to delete your Numeria Arena data." },
  ];
}

const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

function English() {
  return (
    <>
      <h2>Playing without a class</h2>
      <p>
        Everything stays in your browser. To delete it, clear this site's data in your browser settings (on Meta Quest:
        Browser, Settings, Clear browsing data). Nothing else is kept.
      </p>

      <h2>Teachers and organisers</h2>
      <ol>
        <li>
          Write to {mail} from the email address you sign in with, with the subject "Delete my Numeria Arena account".
        </li>
        <li>
          We delete your account, your school or club, its classes and their students' data within 30 days, and reply
          when it is done.
        </li>
      </ol>
      <p>
        If you signed in with Facebook, you can also remove Numeria Arena in Facebook under Settings, Apps and
        websites. That stops Facebook sign-in; to delete what we keep, write to us as above.
      </p>

      <h2>Students and parents</h2>
      <p>
        Ask the class teacher, who can empty a seat for a new student: that deletes its answers, results, town and AI
        suggestions. Removing a class only archives it; to delete a class or a seat's data for good, write to {mail}
        with the class code and seat number. No names are needed. We delete it within 30 days and reply when it is
        done.
      </p>
    </>
  );
}

function Indonesian() {
  return (
    <>
      <h2>Bermain tanpa kelas</h2>
      <p>
        Semuanya tersimpan di browser Anda. Untuk menghapusnya, hapus data situs ini di pengaturan browser (di Meta
        Quest: Browser, Pengaturan, Hapus data penjelajahan). Tidak ada yang tersimpan di tempat lain.
      </p>

      <h2>Guru dan penyelenggara</h2>
      <ol>
        <li>
          Tulis ke {mail} dari alamat email yang Anda pakai untuk masuk, dengan subjek "Hapus akun Numeria Arena saya".
        </li>
        <li>
          Kami menghapus akun Anda, sekolah atau klub Anda, kelas-kelasnya, dan data siswanya dalam 30 hari, lalu
          membalas setelah selesai.
        </li>
      </ol>
      <p>
        Bila Anda masuk dengan Facebook, Anda juga bisa menghapus Numeria Arena di Facebook pada Pengaturan, Aplikasi
        dan situs web. Itu menghentikan masuk lewat Facebook; untuk menghapus data yang kami simpan, tulis ke kami
        seperti di atas.
      </p>

      <h2>Siswa dan orang tua</h2>
      <p>
        Minta guru kelas, yang bisa mengosongkan kursi untuk siswa baru: itu menghapus jawaban, hasil, kota, dan saran
        AI kursi tersebut. Menghapus kelas hanya mengarsipkannya; untuk menghapus data kelas atau kursi sama sekali, tulis
        ke {mail} dengan kode kelas dan nomor kursi. Nama tidak diperlukan. Kami menghapusnya dalam 30 hari dan membalas
        setelah selesai.
      </p>
    </>
  );
}

export default function DataDeletion() {
  const [lang, setLang] = useLang();
  return (
    <PaperPage lang={lang} setLang={setLang} title={lang === "id" ? "PENGHAPUSAN DATA" : "DATA DELETION"}>
      {lang === "id" ? <Indonesian /> : <English />}
    </PaperPage>
  );
}
