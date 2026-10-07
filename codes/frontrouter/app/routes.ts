import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // The site's root opens the game's home page (nginx redirects it in production).
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  route("how-to-play", "routes/how-to-play.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("data-deletion", "routes/data-deletion.tsx"),
  route("credits", "routes/credits.tsx"),
  route("terms", "routes/terms.tsx"),
  route("manage", "routes/manage.tsx"),
  route("screen", "routes/screen.tsx"),
  route("edu", "routes/edu.tsx"),
  route("edu/:id", "routes/edu-lesson.tsx"),
] satisfies RouteConfig;
