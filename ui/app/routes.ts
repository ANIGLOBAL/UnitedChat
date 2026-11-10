import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sign-in", "routes/sign-in.tsx"),
  route("sign-up", "routes/sign-up.tsx"),
  route("messages", "routes/messages.tsx", [
    index("routes/messages-index.tsx"),
    route(":id", "routes/messages.$id.tsx"),
  ]),
  route("dm", "routes/legacy-dm-index.tsx"),
  route("dm/:id", "routes/legacy-dm.tsx"),
  route("groups/:groupId", "routes/groups.$groupId.tsx"),
  route("account", "routes/account.tsx"),
  route("control", "routes/control.tsx"),
  route("admin", "routes/legacy-admin.tsx"),
  route("u/:username", "routes/u.$username.tsx"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
