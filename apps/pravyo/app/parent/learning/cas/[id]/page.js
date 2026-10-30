import { ParentResults } from '@/components/cas/PublishedResults';
export default async function Page({ params }) { return <ParentResults reportId={(await params).id} />; }
