import {
  getMapDirectionsUrl,
  getMapEmbedCoordinates,
  parseGoogleMapEmbed,
} from "@/lib/googleMapEmbed";

const EMBED =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3532.2!2d85.3364!3d27.7323!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39eb1937%3A0x1!2sOmiba!5e0!3m2!1sen!2snp!4v1700000000000!5m2!1sen!2snp";

describe("parseGoogleMapEmbed", () => {
  it("accepts the whole iframe code Google gives under Embed a map", () => {
    const html = `<iframe src="${EMBED.replace(/&/g, "&amp;")}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    expect(parseGoogleMapEmbed(html)).toEqual({ url: EMBED });
  });

  it("accepts the bare embed link and the Embed API form", () => {
    expect(parseGoogleMapEmbed(EMBED)).toEqual({ url: EMBED });
    const api = "https://www.google.com/maps/embed/v1/place?key=abc&q=Kathmandu";
    expect(parseGoogleMapEmbed(api)).toEqual({ url: api });
  });

  it("treats empty input as removing the map", () => {
    expect(parseGoogleMapEmbed("  ")).toEqual({ url: "" });
    expect(parseGoogleMapEmbed(null)).toEqual({ url: "" });
  });

  it.each([
    "https://maps.app.goo.gl/abc123",
    "https://www.google.com/maps/place/Kathmandu",
    "http://www.google.com/maps/embed?pb=x",
    "https://evil.com/maps/embed?pb=x",
    "https://www.google.com.evil.com/maps/embed?pb=x",
    "https://user@www.google.com/maps/embed?pb=x",
    "javascript:alert(1)",
    '<iframe src="https://evil.com/x"></iframe>',
    "Kathmandu, Nepal",
  ])("rejects %s", (input) => {
    expect(parseGoogleMapEmbed(input).error).toBeTruthy();
  });
});

describe("directions", () => {
  it("reads the pinned point from an embed link", () => {
    expect(getMapEmbedCoordinates(EMBED)).toEqual({ lat: 27.7323, lng: 85.3364 });
    expect(getMapDirectionsUrl(EMBED)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=27.7323,85.3364"
    );
  });

  it("falls back to searching the school name and address", () => {
    expect(
      getMapDirectionsUrl("https://www.google.com/maps/embed/v1/place?q=x", "Green School, Kathmandu")
    ).toBe("https://www.google.com/maps/search/?api=1&query=Green%20School%2C%20Kathmandu");
  });
});
