import { redirect } from 'next/navigation';

// Keep old bookmarks working without maintaining a second CAS dashboard.
export default function CasHomePage() {
  redirect('/school/cas/assessment');
}
