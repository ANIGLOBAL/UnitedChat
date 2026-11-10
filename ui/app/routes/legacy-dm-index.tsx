import { Navigate } from "react-router";

export default function LegacyDmIndexRedirect() {
  return <Navigate to="/messages" replace />;
}
