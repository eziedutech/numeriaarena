import type { Route } from "./+types/in-schools";
import { CONTACT, PaperPage, useLang, type Lang } from "../legal";
import { SESSIONS, type SchoolSession } from "../school-sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "In schools - Numeria Arena" },
    {
      name: "description",
      content: "Where Numeria Arena has been tried in schools on Meta Quest headsets, and how each session keeps children safe.",
    },
  ];
}

/** Moved on whenever a session is added or the way sessions are run changes. */
const UPDATED_SCHOOLS = { en: "Last updated 4 November 2026", id: "Terakhir diperbarui 4 November 2026" };

const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  id: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
};

/** "2026-11-03" as "3 November 2026". */
function day(date: string, lang: Lang): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[lang][m - 1] ?? ""} ${y}`;
}

function Session({ s, lang }: { s: SchoolSession; lang: Lang }) {
  const count: string[] = [];
  if (s.students !== undefined) count.push(lang === "id" ? `${s.students} siswa` : `${s.students} students`);
  if (s.headsets !== undefined) count.push(lang === "id" ? `${s.headsets} headset` : `${s.headsets} ${s.headsets === 1 ? "headset" : "headsets"}`);
  return (
    <li>
      <strong>{day(s.date, lang)}</strong>, {s.school[lang]}. {s.level[lang]}, {lang === "id" ? "usia" : "ages"} {s.ages}
      {count.length > 0 ? `, ${count.join(", ")}` : ""}. {s.activity[lang]}
      {s.note ? ` ${s.note[lang]}` : ""}
    </li>
  );
}

function Sessions({ lang }: { lang: Lang }) {
  const list = [...SESSIONS].sort((a, b) => b.date.localeCompare(a.date));
  if (list.length === 0) {
    return <p>{lang === "id" ? "Belum ada sesi yang dicatat di sini." : "No sessions are listed here yet."}</p>;
  }
  return (
    <>
      <p>
        {lang === "id"
          ? `${list.length} sesi, yang terbaru di atas.`
          : `${list.length} ${list.length === 1 ? "session" : "sessions"}, the newest first.`}
      </p>
      <ul>
        {list.map((s) => (
          <Session key={`${s.date}-${s.school.en}`} s={s} lang={lang} />
        ))}
      </ul>
    </>
  );
}

function English() {
  const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
  return (
    <>
      <p>
        Numeria Arena is a maths game for primary school, grades 4 to 6. It is made for those grades, and older students
        can use it too, to practise and review the basics.
      </p>
      <p>
        It is being tried in schools, with students playing on Meta Quest headsets while the developer and their teacher
        watch. This page lists those sessions and how each one is run.
      </p>

      <h2>How a session is run</h2>
      <ul>
        <li>
          <strong>No child account is made or used.</strong> The headsets are signed in to the developer's own adult
          Meta account before the session. No student makes an account, signs in, or sees an account screen.
        </li>
        <li>
          The game asks no student for an account either: students play as guests, or with a class card that holds only a
          seat number and pictures. No name, email or photo of a student is asked for.
        </li>
        <li>Every student plays seated, for a short turn, with the developer and a teacher beside them.</li>
        <li>
          Students aged 10 to 12 take part only with written permission from a parent or guardian, collected by the
          school, since Meta asks a parent to be responsible for headset use at that age. No child under 10 uses a
          headset.
        </li>
        <li>
          Students aged 13 to 18 in secondary schools take part with the school's permission (and a parent's, where the
          school asks for it). The games practise primary school mathematics, which secondary students use to review the
          basics.
        </li>
        <li>No photo or video in which a student can be recognised is published.</li>
        <li>Headsets are cleaned between players, and anyone who feels unwell stops at once.</li>
      </ul>

      <h2>Sessions</h2>
      <Sessions lang="en" />

      <h2>Bringing it to your school</h2>
      <p>Teachers who would like a session can write to {mail}.</p>
    </>
  );
}

function Indonesian() {
  const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
  return (
    <>
      <p>
        Numeria Arena adalah game matematika untuk sekolah dasar, kelas 4 sampai 6. Game ini dibuat untuk kelas-kelas
        itu, dan siswa yang lebih besar juga dapat memakainya untuk berlatih dan mengulang dasar.
      </p>
      <p>
        Numeria Arena sedang dicoba di sekolah: siswa bermain dengan headset Meta Quest sambil didampingi pengembang dan
        gurunya. Halaman ini mencatat sesi-sesi itu dan cara setiap sesi dijalankan.
      </p>

      <h2>Cara sesi dijalankan</h2>
      <ul>
        <li>
          <strong>Tidak ada akun anak yang dibuat atau dipakai.</strong> Headset sudah masuk dengan akun Meta milik
          pengembang (dewasa) sebelum sesi. Tidak ada siswa yang membuat akun, masuk, atau melihat layar akun.
        </li>
        <li>
          Game ini juga tidak meminta akun dari siswa: siswa bermain sebagai tamu, atau dengan kartu kelas yang hanya
          berisi nomor kursi dan gambar. Tidak ada nama, email, atau foto siswa yang diminta.
        </li>
        <li>Setiap siswa bermain sambil duduk, dalam giliran singkat, didampingi pengembang dan guru.</li>
        <li>
          Siswa usia 10 sampai 12 tahun ikut hanya dengan izin tertulis orang tua atau wali yang dikumpulkan sekolah,
          karena Meta meminta orang tua bertanggung jawab atas pemakaian headset pada usia itu. Tidak ada anak di bawah 10
          tahun yang memakai headset.
        </li>
        <li>
          Siswa usia 13 sampai 18 tahun di sekolah menengah ikut dengan izin sekolah (dan izin orang tua bila sekolah
          memintanya). Game ini melatih matematika SD, yang dipakai siswa sekolah menengah untuk mengulang dasar.
        </li>
        <li>Tidak ada foto atau video yang menampilkan siswa secara dapat dikenali yang dipublikasikan.</li>
        <li>Headset dibersihkan di antara pemakai, dan siapa pun yang merasa tidak nyaman langsung berhenti.</li>
      </ul>

      <h2>Sesi</h2>
      <Sessions lang="id" />

      <h2>Sesi di sekolah Anda</h2>
      <p>Guru yang ingin mengadakan sesi bisa menulis ke {mail}.</p>
    </>
  );
}

export default function InSchools() {
  const [lang, setLang] = useLang();
  return (
    <PaperPage lang={lang} setLang={setLang} title={lang === "id" ? "DI SEKOLAH" : "IN SCHOOLS"} updated={UPDATED_SCHOOLS}>
      {lang === "id" ? <Indonesian /> : <English />}
    </PaperPage>
  );
}
