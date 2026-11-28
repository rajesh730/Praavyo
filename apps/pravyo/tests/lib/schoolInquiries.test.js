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

import { inquiryListFilter, parseAdmissionApplication, submissionType } from "@/lib/schoolInquiries";

describe("parseAdmissionApplication", () => {
  const season = { isOpen: true, academicYear: "2083 BS", grades: ["Grade 1", "Grade 2"] };
  const application = {
    studentName: " Aarav  Thapa ",
    grade: "grade 2",
    dateOfBirth: "2076-02-10 BS",
    gender: "male",
    previousSchool: "Little Stars",
    guardianName: "Ram Thapa",
    guardianRelation: "father",
    phone: "9841234567",
    email: "",
    address: "Baneshwor, Kathmandu",
    message: "",
  };

  it("accepts an application for an open grade, with email optional", () => {
    const { data, error } = parseAdmissionApplication(application, season);
    expect(error).toBeUndefined();
    expect(data).toMatchObject({
      type: "ADMISSION",
      name: "Ram Thapa",
      email: "",
      phone: "9841234567",
      subject: "Admission: Aarav Thapa (Grade 2)",
      admission: {
        studentName: "Aarav Thapa",
        grade: "Grade 2",
        gender: "Male",
        guardianRelation: "Father",
        academicYear: "2083 BS",
      },
    });
  });

  it("refuses when the season is closed", () => {
    expect(parseAdmissionApplication(application, { ...season, isOpen: false })).toMatchObject({ code: "ADMISSION_CLOSED" });
  });

  it("refuses a grade that is not taking applications", () => {
    expect(parseAdmissionApplication({ ...application, grade: "Grade 5" }, season)).toMatchObject({
      code: "GRADE_NOT_OPEN",
      error: "Admissions are open for Grade 1, Grade 2 only.",
    });
  });

  it.each([
    ["studentName", "", "Enter the student's name."],
    ["guardianName", "", "Enter the parent or guardian's name."],
    ["phone", "123", "Enter a phone number of 7 to 15 digits."],
    ["email", "nope", "Enter a valid email address."],
    ["grade", "", "Choose the grade you are applying for."],
  ])("rejects a bad %s", (field, value, message) => {
    expect(parseAdmissionApplication({ ...application, [field]: value }, season).error).toBe(message);
  });

  it("drops unknown gender and relation values instead of storing them", () => {
    const { data } = parseAdmissionApplication({ ...application, gender: "<b>", guardianRelation: "uncle" }, season);
    expect(data.admission.gender).toBe("");
    expect(data.admission.guardianRelation).toBe("");
  });
});

describe("submissionType", () => {
  it("is ADMISSION only when asked for", () => {
    expect(submissionType({ type: "admission" })).toBe("ADMISSION");
    expect(submissionType({ type: "other" })).toBe("GENERAL");
    expect(submissionType({})).toBe("GENERAL");
  });
});

describe("inquiryListFilter", () => {
  it("treats rows from before source/type existed as Praavyo + general", () => {
    expect(inquiryListFilter("s1", { status: "active", source: "PRAAVYO", type: "GENERAL" })).toEqual({
      school: "s1",
      status: { $in: ["NEW", "READ"] },
      source: { $in: ["PRAAVYO", null] },
      type: { $in: ["GENERAL", null] },
    });
  });

  it("filters website admissions exactly, and ignores unknown values", () => {
    expect(inquiryListFilter("s1", { status: "NEW", source: "WEBSITE", type: "ADMISSION" })).toEqual({
      school: "s1",
      status: "NEW",
      source: "WEBSITE",
      type: "ADMISSION",
    });
    expect(inquiryListFilter("s1", { source: "x", type: "y" })).toEqual({ school: "s1", status: { $in: ["NEW", "READ"] } });
  });
});

describe("serializeInquiry with source and type", () => {
  it("defaults old rows to Praavyo + general and hides admission data on general rows", () => {
    const row = { _id: "a", name: "N", phone: "1", subject: "S", status: "NEW", createdAt: new Date(0) };
    expect(serializeInquiry(row)).toMatchObject({ type: "GENERAL", source: "PRAAVYO", email: "", message: "", admission: null });
  });
});
