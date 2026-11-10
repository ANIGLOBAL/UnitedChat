import { type RouteConfig, route } from "@react-router/dev/routes";

export default [
  route("api/auth/*", "routes/api.auth.tsx"),
  route("api/me", "routes/api.me.tsx"),
  route("api/users/:username", "routes/api.users.$username.tsx"),
  route("api/conversations", "routes/api.conversations.tsx"),
  route("api/conversations/:id", "routes/api.conversations.$id.tsx"),
  route("api/files", "routes/api.files.tsx"),
  route("api/files/:id", "routes/api.files.$id.tsx"),
  route("api/presence", "routes/api.presence.tsx"),
  route("api/presence/:username", "routes/api.presence.$username.tsx"),
  route("api/admin", "routes/api.admin.tsx"),
  route("api/spaces", "routes/api.spaces.tsx"),
  route("api/spaces/:id", "routes/api.spaces.$id.tsx"),
  route("api/spaces/:id/*", "routes/api.spaces.$id.$.tsx"),
] satisfies RouteConfig;
