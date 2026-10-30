import { StudentResults } from '@/components/cas/PublishedResults';
export default async function Page({ params }) { return <StudentResults reportId={(await params).id} />; }
