'use client';

import StudentProgressPage from '@pravyo/cas/components/StudentProgressPage';

// The screen lives in packages/cas so the teacher area (/teacher/exams/...)
// shows the same one, talking to the teacher API.
export default function Page() {
  return <StudentProgressPage />;
}
