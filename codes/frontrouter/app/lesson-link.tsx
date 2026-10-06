import { lessonFor } from "./edu/catalog";
import type { Lang } from "./legal";

const WORD = { en: "Lesson", id: "Pelajaran" };

/** A link from a skill in a report to its Math Edu lesson, opened beside the report; nothing when it has none. */
export function LessonLink({ skill, lang }: { skill: string; lang: Lang }) {
  const topic = lessonFor(skill);
  if (!topic) return null;
  return (
    <a className="lesson-link" href={`/edu/${topic.id}`} target="_blank" rel="noopener" title={topic.title[lang]}>
      {WORD[lang]}: {topic.title[lang]}
    </a>
  );
}
