import { Navigate, useParams } from "react-router";

export default function LegacyDmRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/messages/${id}` : "/messages"} replace />;
}
