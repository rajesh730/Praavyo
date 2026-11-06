import { parseInquiry, serializeInquiry } from "@/lib/schoolInquiries";

const valid = {
  name: "  Sita   Sharma ",
  email: " Sita.Sharma@Gmail.com ",
  phone: "+977 98-41234567",
  subject: "Admission for Grade 3",
  message: "  Is there a seat in Grade 3\nfor the coming session?  ",
};

describe("parseInquiry", () => {
  it("accepts a complete inquiry and tidies it", () => {
    const { data, error } = parseInquiry(valid);
    expect(error).toBeUndefined();
    expect(data).toEqual({
      name: "Sita Sharma",
      email: "sita.sharma@gmail.com",
      phone: "+977 98-41234567",
      subject: "Admission for Grade 3",
      // Line breaks in the message are kept.
      message: "Is there a seat in Grade 3\nfor the coming session?",
    });
  });

  it("accepts a plain Nepali mobile number", () => {
    expect(parseInquiry({ ...valid, phone: "9841234567" }).data.phone).toBe("9841234567");
  });

  it.each([
    ["name", "", "Enter your name."],
    ["email", "not-an-email", "Enter a valid email address."],
    ["phone", "12345", "Enter a phone number of 7 to 15 digits."],
    ["phone", "98412abc67", "Enter a phone number using digits only."],
    ["subject", "Hi", "Enter a subject."],
    ["message", "Hello", "Write a little more — at least 10 characters."],
    ["message", "x".repeat(2001), "The message is too long."],
  ])("rejects a bad %s (%p)", (field, value, message) => {
    expect(parseInquiry({ ...valid, [field]: value }).error).toBe(message);
  });

  it("rejects a missing body", () => {
    expect(parseInquiry(undefined).error).toBeTruthy();
  });
});

describe("serializeInquiry", () => {
  it("gives the inbox shape with a string id", () => {
    const row = { _id: { toString: () => "abc" }, ...valid, status: "NEW", createdAt: new Date(0), readAt: null };
    expect(serializeInquiry(row)).toMatchObject({ id: "abc", status: "NEW", readAt: null });
  });
});
