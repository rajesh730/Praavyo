import SchoolConfig from '@pravyo/db/models/SchoolConfig';

/**
 * The images on a report card header: the school's logo on the left (the one
 * it uploads for its Pravyo profile) and an optional image on the right that
 * it sets in Settings.
 *
 * They are attached when a card is read rather than frozen into the snapshot,
 * so a school that adds its logo later sees it on every card, published or
 * not. Neither changes what the result says.
 */
export async function loadReportBranding(schoolIds) {
  const ids = [...new Set([].concat(schoolIds).filter(Boolean).map(String))];
  if (!ids.length) return new Map();

  const [configs, profiles] = await Promise.all([
    SchoolConfig.find({ school: { $in: ids } }).select('school reportCardImageUrl').lean(),
    // The profile model belongs to the Pravyo app; read its collection directly.
    SchoolConfig.db.collection('schoolshowcaseprofiles')
      .find({ school: { $in: ids.map((id) => new SchoolConfig.base.Types.ObjectId(id)) } }, { projection: { school: 1, coverImageUrl: 1 } })
      .toArray(),
  ]);
  const imageBySchool = new Map(configs.map((row) => [String(row.school), row.reportCardImageUrl || '']));
  const logoBySchool = new Map(profiles.map((row) => [String(row.school), row.coverImageUrl || '']));
  return new Map(ids.map((id) => [id, {
    logoUrl: logoBySchool.get(id) || '',
    reportImageUrl: imageBySchool.get(id) || '',
  }]));
}

/** Attach one school's header images to each report. */
export async function withBranding(schoolId, reports) {
  const branding = (await loadReportBranding(schoolId)).get(String(schoolId)) || { logoUrl: '', reportImageUrl: '' };
  return reports.map((report) => (report ? { ...report, branding } : report));
}
