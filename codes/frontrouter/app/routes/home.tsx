import { useEffect } from "react";

import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Numeria Arena" },
    { name: "description", content: "A mixed reality maths game: a pop-up book opens on your desk and paper animals bring you questions." },
  ];
}

/**
 * The site's root is the game's own home page at /play/. In production nginx
 * redirects before this page loads; this covers the dev server and old links.
 */
export default function Home() {
  useEffect(() => {
    window.location.replace("/play/");
  }, []);
  return (
    <main className="paper-page">
      <a className="paper-link" href="/play/">
        Numeria Arena
      </a>
    </main>
  );
}
