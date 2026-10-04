import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // The site's root opens the game's home page (nginx redirects it in production).
  index("routes/home.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("data-deletion", "routes/data-deletion.tsx"),
  route("manage", "routes/manage.tsx"),
  route("screen", "routes/screen.tsx"),
] satisfies RouteConfig;
