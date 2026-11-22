jest.mock("web-push", () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}));
jest.mock("@pravyo/db", () => jest.fn());
jest.mock("@pravyo/db/models/Parent", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@pravyo/db/models/User", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@pravyo/db/models/Student", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@pravyo/db/models/Teacher", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@pravyo/db/models/PushSubscription", () => ({
  __esModule: true,
  default: { find: jest.fn(), deleteMany: jest.fn(), deleteOne: jest.fn() },
}));

import webPush from "web-push";
import User from "@pravyo/db/models/User";
import Student from "@pravyo/db/models/Student";
import PushSubscription from "@pravyo/db/models/PushSubscription";
import { sendAccountPush } from "@pravyo/core/webPush";

const selectedLean = (rows) => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(rows) })) });
const device = (account, endpoint, authVersion = 0) => ({
  account,
  endpoint,
  keys: { p256dh: "k", auth: "a" },
  authVersion,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";
  webPush.sendNotification.mockResolvedValue({ statusCode: 201 });
  PushSubscription.deleteMany.mockResolvedValue({});
  PushSubscription.deleteOne.mockResolvedValue({});
});

it("rings every device of an active student, loudly and with its own tray entry", async () => {
  PushSubscription.find.mockReturnValue(selectedLean([device("s1", "https://push.example/a"), device("s1", "https://push.example/b")]));
  Student.find.mockReturnValue(selectedLean([{ _id: "s1" }]));

  const result = await sendAccountPush(
    { role: "STUDENT", accountIds: ["s1"] },
    { notificationId: "n1", title: "Result out", body: "Open it", href: "/student/notices" }
  );

  expect(result.sent).toBe(2);
  expect(PushSubscription.find).toHaveBeenCalledWith({ accountRole: "STUDENT", account: { $in: ["s1"] } });
  const [, body, options] = webPush.sendNotification.mock.calls[0];
  expect(JSON.parse(body)).toEqual(expect.objectContaining({ title: "Result out", href: "/student/notices", tag: "pravyo-n1" }));
  expect(options.urgency).toBe("high");
});

it("drops a school device from an older password generation and never pushes to it", async () => {
  PushSubscription.find.mockReturnValue(selectedLean([device("school1", "https://push.example/old", 2)]));
  User.find.mockReturnValue(selectedLean([{ _id: "school1", authVersion: 3 }]));

  const result = await sendAccountPush({ role: "SCHOOL_ADMIN", accountIds: ["school1"] }, { title: "Notice" });

  expect(result.sent).toBe(0);
  expect(webPush.sendNotification).not.toHaveBeenCalled();
  expect(PushSubscription.deleteMany).toHaveBeenCalledWith({ endpoint: { $in: ["https://push.example/old"] } });
});

it("never rings the person who published the notice", async () => {
  PushSubscription.find.mockReturnValue(selectedLean([device("school1", "https://push.example/me"), device("school2", "https://push.example/other")]));
  User.find.mockReturnValue(selectedLean([{ _id: "school1" }, { _id: "school2" }]));

  const result = await sendAccountPush({ role: "SCHOOL_ADMIN", excludeIds: ["school1"] }, { title: "Platform notice" });

  expect(result.sent).toBe(1);
  expect(webPush.sendNotification.mock.calls[0][0].endpoint).toBe("https://push.example/other");
});

it("sends a safe in-app link even when given an outside one", async () => {
  PushSubscription.find.mockReturnValue(selectedLean([device("s1", "https://push.example/a")]));
  Student.find.mockReturnValue(selectedLean([{ _id: "s1" }]));

  await sendAccountPush({ role: "STUDENT", accountIds: ["s1"] }, { title: "x", href: "https://evil.example" });

  expect(JSON.parse(webPush.sendNotification.mock.calls[0][1]).href).toBe("/student/notices");
});

it("does nothing (and never throws) when push is not configured", async () => {
  delete process.env.VAPID_PRIVATE_KEY;
  const result = await sendAccountPush({ role: "STUDENT", accountIds: ["s1"] }, { title: "x" });
  expect(result.sent).toBe(0);
  expect(PushSubscription.find).not.toHaveBeenCalled();
});
