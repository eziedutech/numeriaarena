import type { Route } from "./+types/about";
import { PaperPage, Shot, useLang } from "../legal";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "About - Numeria Arena" },
    {
      name: "description",
      content: "Numeria Arena: primary school maths in mixed reality, with interactive lessons, fair races and a paper town to build.",
    },
  ];
}

/** The features, grouped as on the feature map: [name, what it is]. */
const FEATURES: { en: string; id: string; items: { en: [string, string]; id: [string, string] }[] }[] = [
  {
    en: "Interactive learning",
    id: "Pembelajaran interaktif",
    items: [
      {
        en: ["MATH LESSONS", "step-by-step paper lessons for grade 4 to 6, on the page or around the learner in VR"],
        id: ["EDUKASI MATEMATIKA", "pelajaran kertas langkah demi langkah untuk kelas 4 sampai 6, di halaman atau di sekeliling siswa dalam VR"],
      },
      {
        en: ["PRACTICE ON MY OWN", "untimed practice at the student's own pace"],
        id: ["BERLATIH SENDIRI", "latihan tanpa waktu, sesuai kecepatan siswa"],
      },
      {
        en: ["Five desk games", "Balloon Burst, Orb Forge, Factory Sort, Bridge Builder and Balance Gate"],
        id: ["Lima game meja", "Balloon Burst, Orb Forge, Factory Sort, Bridge Builder, dan Balance Gate"],
      },
      {
        en: ["A question bank of templates", "new numbers every time, with wrong answers drawn from common misconceptions"],
        id: ["Bank soal templat", "angka selalu baru, dengan pilihan salah dari miskonsepsi yang umum"],
      },
      {
        en: ["Maths in the town", "every building holds a question on its windows, area, perimeter, volume or share of the land"],
        id: ["Matematika di kota", "setiap bangunan menyimpan soal tentang jendela, luas, keliling, volume, atau bagian lahannya"],
      },
    ],
  },
  {
    en: "Races and competition",
    id: "Lomba dan kompetisi",
    items: [
      {
        en: ["RACE THE ROBOTS", "two robot rivals over three timed waves, online or offline"],
        id: ["LOMBA LAWAN ROBOT", "dua robot lawan dalam tiga gelombang berwaktu, online atau offline"],
      },
      {
        en: ["RACE MY CLASSMATES", "a live race for one class, opened by the teacher"],
        id: ["LOMBA DENGAN TEMAN", "lomba langsung satu kelas, dibuka oleh guru"],
      },
      {
        en: ["FIND A RIVAL", "a student of the same grade, or a robot if nobody comes"],
        id: ["CARI LAWAN", "siswa satu tingkat, atau robot bila tidak ada yang datang"],
      },
      {
        en: ["WATCH A MATCH", "follow a live race with a watch code, or the demo match"],
        id: ["TONTON PERTANDINGAN", "ikuti lomba langsung dengan kode tonton, atau pertandingan demo"],
      },
      {
        en: ["RACE ON THE SMARTBOARD", "three players side by side on one big screen, by touch or by a raised hand"],
        id: ["BALAPAN DI SMARTBOARD", "tiga pemain berdampingan di satu layar besar, dengan sentuhan atau tangan terangkat"],
      },
      {
        en: ["LEADERBOARD", "my class and the world: High Strike, Most Diligent and City Builder, this month and all time"],
        id: ["PAPAN PERINGKAT", "kelasku dan dunia: High Strike, Paling Rajin, dan City Builder, bulan ini dan sepanjang masa"],
      },
    ],
  },
  {
    en: "Creativity",
    id: "Kreativitas",
    items: [
      {
        en: ["MY FOLD TOWN", "a paper town built with the Folds every answer earns, on the screen or on the real desk in the headset"],
        id: ["KOTA LIPATKU", "kota kertas yang dibangun dengan Folds dari setiap jawaban, di layar atau di meja nyata lewat headset"],
      },
      {
        en: ["214 town pieces", "houses, schools, parks, a stadium and an airport, each taking its true share of the land"],
        id: ["214 potongan kota", "rumah, sekolah, taman, stadion, sampai bandara, masing-masing dengan ukuran lahan yang sepadan"],
      },
      {
        en: ["Skill landmarks", "a landmark rises in the town for each skill the student masters"],
        id: ["Landmark keterampilan", "satu landmark berdiri di kota untuk setiap keterampilan yang dikuasai"],
      },
      {
        en: ["Four kinds of land and the class map", "plain, river, hill and coast, with every student's land on one class map"],
        id: ["Empat jenis lahan dan peta kelas", "dataran, sungai, bukit, dan pantai, dengan lahan setiap siswa di satu peta kelas"],
      },
    ],
  },
  {
    en: "For teachers",
    id: "Untuk guru",
    items: [
      {
        en: ["MY CLASSES", "class codes and seats with made-up names; real names stay in the teacher's browser"],
        id: ["KELASKU", "kode kelas dan kursi bernama samaran; nama asli tetap di browser guru"],
      },
      {
        en: ["Class report", "first tries by skill and by question, the common mistakes, and a link to the lesson for each weak skill"],
        id: ["Laporan kelas", "percobaan pertama per keterampilan dan per soal, kesalahan yang umum, dan tautan ke pelajaran untuk keterampilan yang lemah"],
      },
      {
        en: ["AI insights and AI practice plan", "a reading of the class, and one to three skills to practise first for a student, made from numbers only"],
        id: ["Wawasan AI dan rencana latihan AI", "bacaan untuk satu kelas, dan satu sampai tiga keterampilan yang perlu dilatih seorang siswa, dibuat hanya dari angka"],
      },
    ],
  },
  {
    en: "Accessibility",
    id: "Aksesibilitas",
    items: [
      {
        en: ["Two languages", "English and Indonesian throughout"],
        id: ["Dua bahasa", "Inggris dan Indonesia di semua bagian"],
      },
      {
        en: ["BIG NUMBERS, NO TIMER, HIGH CONTRAST, READ ALOUD, STEADY AIM", "chosen on the home page and kept on the device"],
        id: ["ANGKA BESAR, TANPA WAKTU, KONTRAS TINGGI, BACAKAN SOAL, BIDIKAN STABIL", "dipilih di beranda dan tersimpan di perangkat"],
      },
      {
        en: ["One hand", "every game plays with one hand; in the headset, point and pull the trigger or pinch"],
        id: ["Satu tangan", "semua game bisa dimainkan dengan satu tangan; di headset, tunjuk lalu tarik trigger atau cubit"],
      },
      {
        en: ["Offline play", "practice and robot races work with no network; answers wait on the device"],
        id: ["Main tanpa jaringan", "latihan dan lomba robot berjalan tanpa jaringan; jawaban menunggu di perangkat"],
      },
    ],
  },
];

function Features({ lang }: { lang: "en" | "id" }) {
  return (
    <>
      {FEATURES.map((g) => (
        <section key={g.en}>
          <h3>{g[lang].toUpperCase()}</h3>
          <ul>
            {g.items.map((f) => (
              <li key={f.en[0]}>
                <strong>{f[lang][0]}</strong>: {f[lang][1]}.
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function English() {
  return (
    <>
      <p className="lead">
        Numeria Arena is a maths game for primary school, grade 4 to 6. In a Meta Quest headset, a pop-up book opens on
        the student's real desk and paper animals walk out of it carrying questions. On a laptop, a tablet or a classroom
        smartboard, the same games play in the browser.
      </p>
      <Shot
        src="about-desk.webp"
        alt="The pop-up book open on a real desk, seen through the headset, with a paper animal and its question"
        caption="In the headset, the game opens on the student's own desk."
      />

      <h2>Why Numeria Arena</h2>
      <p>
        Mathematics is the backbone of STEM and one of the most important things a child learns in primary school. It is
        a required subject in many countries, and Indonesia counts it among its highest priorities. At the same time,
        technology is moving faster than ever, and it ought to make the foundations of mathematics easier to master.
      </p>
      <p>
        Numeria Arena was made to bring new energy to primary mathematics and to make sure it is learned well:
        effectively, in a modern way, and with real enjoyment. It brings several digital technologies together, immersive
        technology among them, into one platform that schools can use across many classes at once.
      </p>

      <h2>Learning, competing, creating</h2>
      <p>Numeria Arena joins three things that usually live apart.</p>
      <ul>
        <li>
          <strong>Interactive learning.</strong> Paper lessons that show how maths works, untimed practice, and questions
          whose numbers are new every time. The wrong answers on offer come from the mistakes children really make, so a
          wrong pick tells the teacher what to explain.
        </li>
        <li>
          <strong>Competitive games.</strong> Races against robots, with classmates, against a rival of the same grade, or
          three at a time on the smartboard. Scores follow the same rules for everyone, and the server checks every
          race that counts.
        </li>
        <li>
          <strong>Creativity.</strong> Every answer earns Folds, and Folds build MY FOLD TOWN, a paper town that grows on
          the desk. Each skill mastered raises a landmark, and each building hides a small maths question of its own.
        </li>
      </ul>

      <h2>Fair races in mixed reality</h2>
      <p>
        A race in the headset is a race and nothing else. While it runs, the student cannot open another page, reach a
        calculator or read a message: only the race is there. The headset turns any desk into a quiet room for a class
        competition, so its results can be trusted.
      </p>
      <Shot
        src="about-race.webp"
        alt="A race against the robots in the headset, with the wave and the robot rivals' scores"
        caption="RACE THE ROBOTS: three timed waves against two robot rivals."
      />

      <h2>Built for schools</h2>
      <ul>
        <li>One game on Meta Quest, on laptops and tablets, and on classroom smartboards.</li>
        <li>No account for children: a class code, a seat number and three pictures are enough, never a real name.</li>
        <li>Practice and robot races work without a network; answers are sent once the device is back online.</li>
        <li>Teachers see a report for each class and each seat, with help from AI when they ask for it.</li>
      </ul>
      <Shot
        src="about-smartboard.webp"
        alt="Three players racing side by side on a classroom smartboard"
        caption="RACE ON THE SMARTBOARD: three players, one big screen."
      />

      <h2>What is inside</h2>
      <Features lang="en" />
      <Shot
        src="about-town.webp"
        alt="A paper town built on a real desk in the headset, with its shelf of pieces beside it"
        caption="MY FOLD TOWN on the desk, built with the Folds the student has earned."
      />
      <Shot
        src="about-report.webp"
        alt="A class report on the teacher page, with the skills, the common mistakes and an AI practice plan"
        caption="The class report on the teacher page."
      />

      <h2>Who makes it</h2>
      <p>
        Numeria Arena is made by EZI Edutech. We would be glad to hear from teachers, parents and schools at the address
        below.
      </p>
    </>
  );
}

function Indonesian() {
  return (
    <>
      <p className="lead">
        Numeria Arena adalah game matematika untuk sekolah dasar, kelas 4 sampai 6. Di headset Meta Quest, sebuah buku
        pop-up terbuka di meja nyata siswa dan hewan-hewan kertas keluar darinya membawa soal. Di laptop, tablet, atau
        smartboard kelas, game yang sama berjalan di browser.
      </p>
      <Shot
        src="about-desk.webp"
        alt="Buku pop-up terbuka di meja nyata, terlihat lewat headset, dengan hewan kertas dan soalnya"
        caption="Di headset, game terbuka di meja siswa sendiri."
      />

      <h2>Mengapa Numeria Arena</h2>
      <p>
        Matematika adalah tulang punggung STEM dan salah satu bidang terpenting yang perlu dikuasai anak di sekolah dasar.
        Di banyak negara matematika menjadi mata pelajaran wajib, dan Indonesia menempatkannya di antara prioritas
        tertingginya. Di sisi lain, teknologi berkembang begitu pesat, dan sudah sepatutnya teknologi membuat dasar-dasar
        matematika semakin mudah dikuasai.
      </p>
      <p>
        Numeria Arena hadir untuk menggiatkan pembelajaran matematika di sekolah dasar dan memastikannya berlangsung
        secara efektif, modern, sekaligus menyenangkan. Dengan memadukan berbagai teknologi digital, salah satunya
        teknologi imersif, Numeria Arena menjadi platform yang layak diandalkan untuk digunakan secara luas di
        sekolah-sekolah.
      </p>

      <h2>Belajar, berlomba, berkreasi</h2>
      <p>Numeria Arena menyatukan tiga hal yang biasanya berjalan sendiri-sendiri.</p>
      <ul>
        <li>
          <strong>Pembelajaran interaktif.</strong> Pelajaran kertas yang memperlihatkan cara kerja matematika, latihan
          tanpa waktu, dan soal dengan angka yang selalu baru. Pilihan jawaban yang salah diambil dari kekeliruan yang
          sungguh sering dibuat anak, sehingga setiap pilihan yang keliru memberi tahu guru apa yang perlu dijelaskan.
        </li>
        <li>
          <strong>Game kompetitif.</strong> Lomba melawan robot, bersama teman sekelas, melawan siswa satu tingkat, atau
          bertiga di smartboard. Skor mengikuti aturan yang sama untuk semua, dan server memeriksa setiap lomba yang
          dihitung.
        </li>
        <li>
          <strong>Kreativitas.</strong> Setiap jawaban memberi Folds, dan Folds membangun KOTA LIPATKU, kota kertas yang
          tumbuh di atas meja. Setiap keterampilan yang dikuasai mendirikan satu landmark, dan setiap bangunan menyimpan
          soal matematika kecilnya sendiri.
        </li>
      </ul>

      <h2>Lomba yang jujur dalam mixed reality</h2>
      <p>
        Lomba di headset hanyalah lomba itu sendiri. Selama berlangsung, siswa tidak dapat membuka halaman lain, meraih
        kalkulator, atau membaca pesan: yang ada hanya lomba yang sedang diikuti. Headset mengubah meja mana pun menjadi
        ruang yang tenang untuk kompetisi kelas, sehingga hasilnya dapat dipercaya.
      </p>
      <Shot
        src="about-race.webp"
        alt="Lomba melawan robot di headset, dengan gelombang dan skor robot lawan"
        caption="LOMBA LAWAN ROBOT: tiga gelombang berwaktu melawan dua robot."
      />

      <h2>Dibuat untuk sekolah</h2>
      <ul>
        <li>Satu game untuk Meta Quest, laptop dan tablet, serta smartboard kelas.</li>
        <li>Anak tidak perlu akun: kode kelas, nomor kursi, dan tiga gambar sudah cukup, tidak pernah nama asli.</li>
        <li>Latihan dan lomba robot berjalan tanpa jaringan; jawaban terkirim begitu perangkat kembali online.</li>
        <li>Guru melihat laporan untuk setiap kelas dan setiap kursi, dengan bantuan AI bila diminta.</li>
      </ul>
      <Shot
        src="about-smartboard.webp"
        alt="Tiga pemain berlomba berdampingan di smartboard kelas"
        caption="BALAPAN DI SMARTBOARD: tiga pemain, satu layar besar."
      />

      <h2>Isi Numeria Arena</h2>
      <Features lang="id" />
      <Shot
        src="about-town.webp"
        alt="Kota kertas yang dibangun di meja nyata lewat headset, dengan rak potongan di sampingnya"
        caption="KOTA LIPATKU di atas meja, dibangun dengan Folds yang dikumpulkan siswa."
      />
      <Shot
        src="about-report.webp"
        alt="Laporan kelas di halaman guru, dengan keterampilan, kesalahan yang umum, dan rencana latihan AI"
        caption="Laporan kelas di halaman guru."
      />

      <h2>Pembuat</h2>
      <p>
        Numeria Arena dibuat oleh EZI Edutech. Kami senang mendengar dari guru, orang tua, dan sekolah di alamat di
        bawah.
      </p>
    </>
  );
}

export default function About() {
  const [lang, setLang] = useLang();
  return (
    <PaperPage lang={lang} setLang={setLang} title={lang === "id" ? "TENTANG NUMERIA ARENA" : "ABOUT NUMERIA ARENA"}>
      {lang === "id" ? <Indonesian /> : <English />}
    </PaperPage>
  );
}
