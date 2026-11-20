import { Navigate } from 'react-router-dom';

export default function ProfilePage() {
  return <Navigate replace to="/?panel=profile" />;
}
