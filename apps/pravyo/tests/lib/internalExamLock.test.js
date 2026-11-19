jest.mock('@pravyo/cas/lib/casRoute', () => ({
  handler: (fn) => fn,
  teacherHandler: (fn) => fn,
}));

import {
  internalExamHandler,
  internalExamTeacherHandler,
} from '@/lib/exams/internalExamLock';

describe('Internal Exam access', () => {
  it('allows school and teacher endpoints without a platform lock', async () => {
    const endpoint = jest.fn().mockResolvedValue({ saved: true });

    await expect(internalExamHandler(endpoint)({ actor: {} })).resolves.toEqual({ saved: true });
    await expect(internalExamTeacherHandler(endpoint)({ actor: {} })).resolves.toEqual({ saved: true });

    expect(endpoint).toHaveBeenCalledTimes(2);
  });
});
