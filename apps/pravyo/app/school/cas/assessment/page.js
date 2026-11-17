'use client';

import AssessmentPage from '@pravyo/cas/components/AssessmentPage';

// The screen lives in packages/cas so the teacher area (/teacher/exams/...)
// shows the same one, talking to the teacher API.
export default function Page() {
  return <AssessmentPage />;
}
