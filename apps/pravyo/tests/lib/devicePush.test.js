jest.mock("@pravyo/core/webPush", () => ({ sendAccountPush: jest.fn() }));
jest.mock("@/models/Student", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/Event", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/EventSchoolInvitation", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/ParticipationRequest", () => ({ __esModule: true, default: { find: jest.fn() } }));

import { sendAccountPush } from "@pravyo/core/webPush";
import Student from "@/models/Student";
import EventSchoolInvitation from "@/models/EventSchoolInvitation";
import ParticipationRequest from "@/models/ParticipationRequest";
import { pushEventNoticePublished, pushNoticePublished, pushUserNotifications } from "@/lib/devicePush";

const distinct = (rows) => ({ distinct: jest.fn().mockResolvedValue(rows) });

beforeEach(() => {
  jest.clearAllMocks();
  sendAccountPush.mockResolvedValue({ sent: 1 });
});

it("rings the student or the school a notification row is for, and skips parent rows", async () => {
  await pushUserNotifications([
    { _id: "n1", targetRole: "STUDENT", recipientStudent: "s1", title: "Certificate ready", message: "View it", href: "/student/dashboard" },
    { _id: "n2", targetRole: "SCHOOL_ADMIN", school: "school1", title: "New message", message: "From a parent" },
    { _id: "n3", targetRole: "PARENT", recipientParent: "p1", title: "Parent row" },
  ]);

  expect(sendAccountPush).toHaveBeenCalledTimes(2);
  expect(sendAccountPush).toHaveBeenCalledWith(
    { role: "STUDENT", accountIds: ["s1"] },
    expect.objectContaining({ notificationId: "n1", title: "Certificate ready", href: "/student/dashboard" })
  );
  expect(sendAccountPush).toHaveBeenCalledWith(
    { role: "SCHOOL_ADMIN", accountIds: ["school1"] },
    expect.objectContaining({ notificationId: "n2" })
  );
});

it("rings every school for a published platform notice", async () => {
  await pushNoticePublished(
    { _id: "x", status: "PUBLISHED", scope: "PLATFORM", title: "Holiday", content: "Closed" },
    { excludeIds: ["admin1"] }
  );
  expect(sendAccountPush).toHaveBeenCalledWith(
    { role: "SCHOOL_ADMIN", excludeIds: ["admin1"] },
    expect.objectContaining({ title: "Holiday", href: "/school/dashboard?tab=notices&section=received" })
  );
});

it("rings only the chosen families' students for a chosen-families notice", async () => {
  Student.find.mockReturnValue(distinct(["s7"]));
  await pushNoticePublished({
    _id: "y",
    status: "PUBLISHED",
    scope: "SCHOOL",
    school: "school1",
    grades: ["Grade 3"],
    targetStudents: ["s7"],
    targetAudience: { students: true },
    title: "Meeting",
    content: "Friday",
  });
  const query = Student.find.mock.calls[0][0];
  expect(query._id).toEqual({ $in: ["s7"] });
  expect(sendAccountPush).toHaveBeenCalledWith(
    expect.objectContaining({ role: "STUDENT", accountIds: ["s7"] }),
    expect.anything()
  );
});

it("rings only the chosen grades' students for a school notice", async () => {
  Student.find.mockReturnValue(distinct(["s3"]));
  await pushNoticePublished({
    _id: "x",
    status: "PUBLISHED",
    scope: "SCHOOL",
    school: "school1",
    grades: ["Grade 3"],
    targetAudience: { students: true },
    title: "Picnic",
    content: "Friday",
  });
  const query = Student.find.mock.calls[0][0];
  expect(query.school).toBe("school1");
  expect(query.grade.$in).toEqual(expect.arrayContaining(["Grade 3", "3"]));
  expect(sendAccountPush).toHaveBeenCalledWith(
    expect.objectContaining({ role: "STUDENT", accountIds: ["s3"], school: "school1" }),
    expect.objectContaining({ title: "Picnic", href: "/student/notices" })
  );
});

it("does not ring anyone for a draft or a parents-only notice", async () => {
  await pushNoticePublished({ status: "DRAFT", scope: "PLATFORM", title: "x" });
  await pushNoticePublished({ status: "PUBLISHED", scope: "SCHOOL", school: "s", targetAudience: { parents: true }, title: "x" });
  expect(sendAccountPush).not.toHaveBeenCalled();
});

it("rings the invited and taking-part schools for a platform event notice", async () => {
  EventSchoolInvitation.find.mockReturnValue(distinct(["school1"]));
  ParticipationRequest.find.mockReturnValue(distinct(["school1", "school2"]));
  await pushEventNoticePublished(
    { _id: "en1", status: "PUBLISHED", title: "Round 2 schedule", message: "Starts Monday" },
    { _id: "e1", eventScope: "PLATFORM", title: "Quiz" }
  );
  expect(sendAccountPush).toHaveBeenCalledWith(
    expect.objectContaining({ role: "SCHOOL_ADMIN", accountIds: ["school1", "school2"] }),
    expect.objectContaining({ title: "Round 2 schedule" })
  );
});
