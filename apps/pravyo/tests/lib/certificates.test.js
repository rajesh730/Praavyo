import { isPublicTrainingCertificate, PUBLIC_TRAINING_STATUSES } from "@/lib/certificates";

const issued = {
  certificateIssuedAt: new Date("2026-11-06"),
  certificateUrl: "/certificates/a1",
  certificateState: "CERTIFICATE_ACTIVE",
};

describe("isPublicTrainingCertificate — the public training page's View links must open", () => {
  it("opens an issued certificate of every training the public site lists", () => {
    PUBLIC_TRAINING_STATUSES.forEach((status) => {
      expect(isPublicTrainingCertificate({ ...issued, training: { _id: "t1", status } })).toBe(true);
    });
  });

  it("keeps it private when the training is not on the public site", () => {
    expect(isPublicTrainingCertificate({ ...issued, training: { _id: "t1", status: "DRAFT" } })).toBe(false);
  });

  it("keeps it private when the certificate is not issued or was withdrawn", () => {
    const training = { _id: "t1", status: "PUBLISHED" };
    expect(isPublicTrainingCertificate({ ...issued, certificateIssuedAt: null, training })).toBe(false);
    expect(isPublicTrainingCertificate({ ...issued, certificateState: "CERTIFICATE_REVOKED", training })).toBe(false);
  });

  it("never makes program or competition certificates public", () => {
    expect(isPublicTrainingCertificate({ ...issued, program: { _id: "p1" } })).toBe(false);
    expect(isPublicTrainingCertificate({ ...issued, event: { _id: "e1" } })).toBe(false);
  });
});
