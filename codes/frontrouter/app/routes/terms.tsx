import type { Route } from "./+types/terms";
import { CONTACT, PaperPage, useLang } from "../legal";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Terms of use - Numeria Arena" },
    { name: "description", content: "The terms for playing Numeria Arena and for teachers and organisers who run classes in it." },
  ];
}

const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

function English() {
  return (
    <>
      <p className="lead">
        These terms apply to everyone who uses Numeria Arena. Teachers and organisers agree to them when they tick the
        statement to make classes. Read them with the <a href="/privacy">privacy policy</a>.
      </p>

      <h2>1. What Numeria Arena is</h2>
      <p>
        Numeria Arena is a free maths game for children, in a headset, on a computer and on a classroom smartboard. It is
        an independent project made and run by its developer, who can be reached at {mail}.
      </p>

      <h2>2. Playing</h2>
      <ul>
        <li>Anyone may play without an account. Progress then stays on the device.</li>
        <li>
          A child may join a class only with the card their teacher gives them, and only for the seat on that card.
        </li>
        <li>Play fairly: do not use another student's card, and do not use tools to answer for you.</li>
      </ul>

      <h2>3. Teacher and organiser accounts</h2>
      <ul>
        <li>An account is for one adult who teaches or runs groups of children, signed in with their own email.</li>
        <li>
          A new account can make one small class until the developer approves it. The developer may approve, limit or
          refuse an account.
        </li>
        <li>Keep your sign-in to yourself, and sign out on shared computers.</li>
      </ul>

      <h2>4. Using it on behalf of an institution</h2>
      <p>
        Numeria Arena may not be used officially on behalf of a school, organisation, company or any other institution,
        for example as part of its official programme, in its name, or presented as its own service, without written
        permission from the developer or another agreement with them. A teacher or organiser may use it with their own
        groups on their own responsibility. Using Numeria Arena does not create any partnership, endorsement or other tie
        between an institution and the developer. To ask for permission, write to {mail}.
      </p>

      <h2>5. What organisers take on</h2>
      <ul>
        <li>
          You are responsible for the children in your classes, and you get their parents' permission as your local
          rules require before they play in a class.
        </li>
        <li>
          Give each child only their own card. Keep the cards and the list of names safe; the names stay only in your
          browser, so a copy you save is yours to look after.
        </li>
        <li>
          Do not write a child's real name or other personal details into a class name or anywhere else the game sends
          to the server.
        </li>
        <li>When a child leaves, empty their seat or delete the class.</li>
      </ul>

      <h2>6. What is not allowed</h2>
      <ul>
        <li>Trying to break, overload or get around the game's limits, sign-ins or fairness checks.</li>
        <li>Reading or changing data that is not yours, or collecting data about other players.</li>
        <li>Selling access to Numeria Arena or putting it behind a paywall.</li>
        <li>Using it to harm, harass or mislead children or anyone else.</li>
      </ul>

      <h2>7. AI suggestions</h2>
      <p>
        Class insights and practice plans are made by an AI from a class's numbers alone. They are suggestions and can
        be wrong: the teacher decides what to do with them.
      </p>

      <h2>8. Licences</h2>
      <p>
        The game's code is released under the MIT License and its own art under CC0 1.0; the software it is built with
        keeps its own licences, listed on the <a href="/credits">credits page</a>. The names Numeria Arena and Fold Town
        may not be used to suggest that a product or service comes from the developer.
      </p>

      <h2>9. No guarantee</h2>
      <p>
        Numeria Arena is provided free and as it is. It may change, pause or stop, and data may be lost; keep your own
        copy of anything you need, such as names and reports. As far as the law allows, the developer is not liable for
        any loss that comes from using it.
      </p>

      <h2>10. Suspension and ending</h2>
      <p>
        The developer may suspend an account that breaks these terms, and delete what it holds. You may delete
        your classes at any time on the class page, and ask for your account to be deleted on the{" "}
        <a href="/data-deletion">data deletion page</a>.
      </p>

      <h2>11. Changes</h2>
      <p>
        When these terms change, the date below changes too, and teachers are asked to agree again where the change
        matters.
      </p>
    </>
  );
}

function Indonesian() {
  return (
    <>
      <p className="lead">
        Syarat ini berlaku untuk semua yang memakai Numeria Arena. Guru dan penyelenggara menyetujuinya saat mencentang
        pernyataan untuk membuat kelas. Bacalah bersama <a href="/privacy">kebijakan privasi</a>.
      </p>

      <h2>1. Apa itu Numeria Arena</h2>
      <p>
        Numeria Arena adalah game matematika gratis untuk anak-anak, di headset, di komputer, dan di smartboard kelas. Ini
        proyek mandiri yang dibuat dan dijalankan oleh pengembangnya, yang bisa dihubungi di {mail}.
      </p>

      <h2>2. Bermain</h2>
      <ul>
        <li>Siapa pun boleh bermain tanpa akun. Progresnya tetap di perangkat.</li>
        <li>Anak hanya boleh masuk kelas dengan kartu dari gurunya, dan hanya untuk kursi di kartu itu.</li>
        <li>Bermainlah dengan jujur: jangan memakai kartu siswa lain, dan jangan memakai alat untuk menjawab.</li>
      </ul>

      <h2>3. Akun guru dan penyelenggara</h2>
      <ul>
        <li>Satu akun untuk satu orang dewasa yang mengajar atau menjalankan grup anak, masuk dengan emailnya sendiri.</li>
        <li>
          Akun baru bisa membuat satu kelas kecil sampai pengembang menyetujuinya. Pengembang boleh menyetujui,
          membatasi, atau menolak akun.
        </li>
        <li>Jaga akses masuk Anda sendiri, dan keluar dari akun di komputer bersama.</li>
      </ul>

      <h2>4. Pemakaian atas nama lembaga</h2>
      <p>
        Numeria Arena tidak boleh digunakan secara resmi atas nama sekolah, organisasi, perusahaan, atau lembaga lain,
        misalnya sebagai bagian dari program resminya, dengan namanya, atau ditampilkan sebagai layanannya sendiri, tanpa
        izin tertulis dari pengembang atau perjanjian lain dengannya. Guru atau penyelenggara boleh memakainya bersama
        grupnya sendiri atas tanggung jawabnya sendiri. Memakai Numeria Arena tidak menciptakan kemitraan, dukungan,
        atau ikatan lain apa pun antara sebuah lembaga dan pengembang. Untuk meminta izin, tulis ke {mail}.
      </p>

      <h2>5. Kewajiban penyelenggara</h2>
      <ul>
        <li>
          Anda bertanggung jawab atas anak-anak di kelas Anda, dan meminta izin orang tua mereka sesuai aturan setempat
          sebelum mereka bermain di kelas.
        </li>
        <li>
          Berikan tiap anak hanya kartunya sendiri. Simpan kartu dan daftar nama dengan aman; nama hanya tersimpan di
          browser Anda, jadi salinan yang Anda simpan menjadi tanggung jawab Anda.
        </li>
        <li>
          Jangan menulis nama asli anak atau data pribadi lain di nama kelas atau di tempat lain yang dikirim game ke
          server.
        </li>
        <li>Saat anak keluar, kosongkan kursinya atau hapus kelasnya.</li>
      </ul>

      <h2>6. Yang tidak boleh</h2>
      <ul>
        <li>Mencoba merusak, membebani, atau mengakali batas, sistem masuk, atau pemeriksaan keadilan game.</li>
        <li>Membaca atau mengubah data yang bukan milik Anda, atau mengumpulkan data tentang pemain lain.</li>
        <li>Menjual akses ke Numeria Arena atau menaruhnya di balik pembayaran.</li>
        <li>Memakainya untuk merugikan, merundung, atau menyesatkan anak-anak atau siapa pun.</li>
      </ul>

      <h2>7. Saran AI</h2>
      <p>
        Wawasan kelas dan rencana latihan dibuat oleh AI hanya dari angka-angka kelas. Itu saran dan bisa keliru: guru
        yang memutuskan langkahnya.
      </p>

      <h2>8. Lisensi</h2>
      <p>
        Kode game dirilis dengan Lisensi MIT dan gambarnya sendiri dengan CC0 1.0; perangkat lunak yang dipakainya tetap
        dengan lisensinya masing-masing, tercantum di <a href="/credits">halaman kredit</a>. Nama Numeria Arena dan Fold
        Town tidak boleh dipakai untuk mengesankan bahwa suatu produk atau layanan berasal dari pengembang.
      </p>

      <h2>9. Tanpa jaminan</h2>
      <p>
        Numeria Arena disediakan gratis dan apa adanya. Game ini bisa berubah, berhenti sementara, atau berhenti, dan data
        bisa hilang; simpan sendiri salinan yang Anda perlukan, seperti nama dan laporan. Sejauh diizinkan hukum,
        pengembang tidak bertanggung jawab atas kerugian yang timbul dari pemakaiannya.
      </p>

      <h2>10. Penangguhan dan pengakhiran</h2>
      <p>
        Pengembang boleh menangguhkan akun yang melanggar syarat ini, dan menghapus isinya. Anda boleh
        menghapus kelas kapan saja di halaman kelas, dan meminta penghapusan akun lewat{" "}
        <a href="/data-deletion">halaman penghapusan data</a>.
      </p>

      <h2>11. Perubahan</h2>
      <p>
        Bila syarat ini berubah, tanggal di bawah ikut berubah, dan guru diminta menyetujui lagi bila perubahannya
        penting.
      </p>
    </>
  );
}

export default function Terms() {
  const [lang, setLang] = useLang();
  return (
    <PaperPage lang={lang} setLang={setLang} title={lang === "id" ? "SYARAT PENGGUNAAN" : "TERMS OF USE"}>
      {lang === "id" ? <Indonesian /> : <English />}
    </PaperPage>
  );
}
