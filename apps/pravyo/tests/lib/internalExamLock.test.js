jest.mock('@/lib/db', () => jest.fn());
jest.mock('@/models/PlatformSetting', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('@pravyo/cas/lib/casRoute', () => {
  class HttpError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return { HttpError, handler: (fn) => fn, teacherHandler: (fn) => fn };
});

import PlatformSetting from '@/models/PlatformSetting';
import {
  INTERNAL_EXAM_LOCKED_MESSAGE,
  clearInternalExamLockCache,
  internalExamHandler,
  internalExamTeacherHandler,
  isInternalExamLocked,
} from '@/lib/exams/internalExamLock';

function savedSetting(governance) {
  PlatformSetting.findOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(governance === undefined ? null : { governance }) }),
  });
}

describe('Internal Exam lock', () => {
  beforeEach(() => {
    clearInternalExamLockCache();
  });

  it('is locked when the platform has never saved the setting', async () => {
    savedSetting(undefined);
    await expect(isInternalExamLocked()).resolves.toBe(true);
    clearInternalExamLockCache();
    savedSetting({});
    await expect(isInternalExamLocked()).resolves.toBe(true);
  });

  it('opens only when the Super Admin unticks it', async () => {
    savedSetting({ internalExamsLocked: false });
    await expect(isInternalExamLocked()).resolves.toBe(false);
  });

  it('refuses school and teacher endpoints with 423 while locked', async () => {
    savedSetting({ internalExamsLocked: true });
    const endpoint = jest.fn().mockResolvedValue({ saved: true });

    for (const wrap of [internalExamHandler, internalExamTeacherHandler]) {
      await expect(wrap(endpoint)({ actor: {} })).rejects.toMatchObject({
        status: 423,
        message: INTERNAL_EXAM_LOCKED_MESSAGE,
      });
    }
    expect(endpoint).not.toHaveBeenCalled();
  });

  it('runs the endpoint once unlocked', async () => {
    savedSetting({ internalExamsLocked: false });
    const endpoint = jest.fn().mockResolvedValue({ saved: true });
    await expect(internalExamHandler(endpoint)({ actor: {} })).resolves.toEqual({ saved: true });
    expect(endpoint).toHaveBeenCalledTimes(1);
  });
});
