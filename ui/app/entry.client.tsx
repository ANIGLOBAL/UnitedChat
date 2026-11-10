import { StrictMode, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router";

import { appBase } from "./lib/api";
import App from "./root";
import Account from "./routes/account";
import Control from "./routes/control";
import GroupPage from "./routes/groups.$groupId";
import Home from "./routes/home";
import LegacyAdminRedirect from "./routes/legacy-admin";
import LegacyDmRedirect from "./routes/legacy-dm";
import MessageThread from "./routes/messages.$id";
import MessagesIndex from "./routes/messages-index";
import MessagesLayout from "./routes/messages";
import NotFound from "./routes/not-found";
import { RouteError } from "./routes/route-error";
import SignIn from "./routes/sign-in";
import SignUp from "./routes/sign-up";
import PublicProfilePage from "./routes/u.$username";

const basename = appBase();

const router = createBrowserRouter(
  [
    {
      element: <App />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Home /> },
        { path: "sign-in", element: <SignIn /> },
        { path: "sign-up", element: <SignUp /> },
        {
          path: "messages",
          element: <MessagesLayout />,
          children: [
            { index: true, element: <MessagesIndex /> },
            { path: ":id", element: <MessageThread /> },
          ],
        },
        { path: "dm", element: <LegacyDmRedirect /> },
        { path: "dm/:id", element: <LegacyDmRedirect /> },
        { path: "groups/:groupId", element: <GroupPage /> },
        { path: "account", element: <Account /> },
        { path: "control", element: <Control /> },
        { path: "admin", element: <LegacyAdminRedirect /> },
        { path: "u/:username", element: <PublicProfilePage /> },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  { basename },
);

startTransition(() => {
  createRoot(document.body).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});
