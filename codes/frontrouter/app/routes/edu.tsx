import { useEffect, useState } from "react";

import { AREAS, type Area, TOPICS, ready } from "../edu/catalog";
import { EduNav } from "../edu/nav";
import { useLang } from "../legal";
import "../edu/edu.css";
import { GAME } from "../game-link";

export function meta() {
  return [
    { title: "Math Edu - Numeria Arena" },
    { name: "description", content: "Paper lessons that show and guide primary school maths, grade 4 to 6, on the page and in VR." },
  ];
}

const TEXT = {
  en: {
    title: "MATH EDU",
    lead: "Paper lessons that show how maths works: watch, move things, and see what happens. No questions, no scores. Open one on a smartboard for the class, or on your own, or step inside it in VR.",
    grade: (g: number) => `GRADE ${g}`,
    steps: "Open",
    soon: "Coming",
    game: "TO THE GAME",
  },
  id: {
    title: "MATH EDU",
    lead: "Pelajaran kertas yang memperlihatkan cara kerja matematika: lihat, geser, dan amati yang terjadi. Tanpa soal, tanpa skor. Buka di smartboard untuk satu kelas, sendiri, atau masuk ke dalamnya lewat VR.",
    grade: (g: number) => `KELAS ${g}`,
    steps: "Buka",
    soon: "Segera",
    game: "KE GAME",
  },
};

const GRADES = [4, 5, 6] as const;

export default function Edu() {
  const [lang, setLang] = useLang();
  const t = TEXT[lang];
  const [grade, setGrade] = useState<4 | 5 | 6>(4);
  useEffect(() => {
    const g = Number(new URLSearchParams(window.location.search).get("grade"));
    if (g === 4 || g === 5 || g === 6) setGrade(g);
  }, []);
  const choose = (g: 4 | 5 | 6) => {
    setGrade(g);
    window.history.replaceState(null, "", `?grade=${g}`);
  };
  const areas = (Object.keys(AREAS) as Area[]).filter((a) => TOPICS.some((x) => x.grade === grade && x.area === a));

  return (
    <main className="paper-page edu">
      <EduNav lang={lang} setLang={setLang} back={{ href: GAME, label: t.game }} />
      <article className="paper-sheet edu-index">
        <h1>{t.title}</h1>
        <p className="soft">{t.lead}</p>
        <div className="tabs edu-grades" role="tablist">
          {GRADES.map((g) => (
            <button key={g} type="button" role="tab" aria-selected={g === grade} className={g === grade ? "tab on" : "tab"} onClick={() => choose(g)}>
              {t.grade(g)}
            </button>
          ))}
        </div>
        {areas.map((a) => (
          <section key={a} className="edu-area">
            <h2>{AREAS[a][lang]}</h2>
            <ol className="edu-topics">
              {TOPICS.filter((x) => x.grade === grade && x.area === a).map((x) =>
                ready(x.id) ? (
                  <li key={x.id}>
                    <a className="edu-topic" href={`/edu/${x.id}`}>
                      <span>{x.title[lang]}</span>
                      <span className="edu-open">{t.steps}</span>
                    </a>
                  </li>
                ) : (
                  <li key={x.id}>
                    <span className="edu-topic soon" aria-disabled="true">
                      <span>{x.title[lang]}</span>
                      <span className="edu-open">{t.soon}</span>
                    </span>
                  </li>
                ),
              )}
            </ol>
          </section>
        ))}
      </article>
    </main>
  );
}
