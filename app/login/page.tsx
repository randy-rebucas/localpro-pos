import { redirect } from 'next/navigation';

// Redirect bare /login to the store selector
export default function LoginRedirect() {
  redirect('/stores');
}
