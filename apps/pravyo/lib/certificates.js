export function getActiveCertificateFilter() {
  return {
    certificateIssuedAt: { $ne: null },
    certificateUrl: { $type: "string", $ne: "" },
    $or: [
      { certificateState: "CERTIFICATE_ACTIVE" },
      { certificateState: { $exists: false } },
    ],
  };
}

export function isActiveCertificateRecord(achievement) {
  return Boolean(
    achievement?.certificateIssuedAt &&
      achievement?.certificateUrl &&
      (achievement.certificateState === "CERTIFICATE_ACTIVE" ||
        achievement.certificateState === undefined)
  );
}

/**
 * Training statuses the public site shows (/trainings, /trainings/[id]).
 * Shared with the certificate page so the two can never disagree.
 */
export const PUBLIC_TRAINING_STATUSES = ["PUBLISHED", "CLOSED"];

/**
 * A training certificate is public (owner, 2026-11-06: trainings are
 * "completely public") once issued and while its training is on the public
 * site — the public training page lists it with a View link, so anyone who
 * clicks that link must be able to open it. Needs `training` populated with
 * `status`. Program (performance) certificates stay private.
 */
export function isPublicTrainingCertificate(achievement) {
  return Boolean(
    achievement?.training &&
      PUBLIC_TRAINING_STATUSES.includes(achievement.training.status) &&
      isActiveCertificateRecord(achievement)
  );
}
