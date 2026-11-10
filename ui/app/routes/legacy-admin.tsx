import { Navigate } from "react-router";

export default function LegacyAdminRedirect() {
  return <Navigate to="/control" replace />;
}
