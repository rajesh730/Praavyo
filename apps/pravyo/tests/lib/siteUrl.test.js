import { CANONICAL_SITE_URL, printableOrigin } from "@/lib/siteUrl";
import { readTeacherCard, teacherCardUrl } from "@/lib/teacherCard";
import { readParentCard } from "@/components/parent/QrCardScanner";

describe("printableOrigin", () => {
  it("swaps redirecting domains for the live one", () => {
    expect(CANONICAL_SITE_URL).toBe("https://www.praavyo.com");
    expect(printableOrigin("https://praavyo.com/")).toBe(CANONICAL_SITE_URL);
    expect(printableOrigin("https://pravyo.infobytesnepal.com")).toBe(CANONICAL_SITE_URL);
    expect(printableOrigin("http://pravyo.infobytesnepal.com/")).toBe(CANONICAL_SITE_URL);
  });

  it("leaves the live domain, previews and localhost alone", () => {
    expect(printableOrigin("https://www.praavyo.com/")).toBe("https://www.praavyo.com");
    expect(printableOrigin("https://pravyo-git-main.vercel.app")).toBe("https://pravyo-git-main.vercel.app");
    expect(printableOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(printableOrigin("")).toBe("");
  });

  it("keeps cards printed on the old domain readable", () => {
    expect(readTeacherCard(teacherCardUrl("https://pravyo.infobytesnepal.com", "ram.sharma"))).toBe("ram.sharma");
    expect(readParentCard("https://pravyo.infobytesnepal.com/parent/login?id=PRV-P-X7K4Q9")).toEqual({ parentId: "PRV-P-X7K4Q9" });
  });
});
