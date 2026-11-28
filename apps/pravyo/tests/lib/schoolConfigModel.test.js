/**
 * Regression (2026-11-28): a long-running server kept a SchoolConfig model
 * compiled before `gradesCustomized` existed, so saving a school's grades
 * silently dropped the flag and a refresh reverted them to the signup range.
 * The model module now rebuilds a cached model that is missing any field.
 *
 * Each test runs in its own module registry, and the stale model is
 * registered on THAT registry's mongoose — the same instance the model file
 * uses — so the guard is really exercised.
 */
describe("SchoolConfig model", () => {
  it("replaces a stale cached model that lacks newer fields", () => {
    jest.isolateModules(() => {
      const mongoose = require("mongoose");
      mongoose.model("SchoolConfig", new mongoose.Schema({ school: mongoose.Schema.Types.ObjectId, grades: [String] }));
      const stale = mongoose.models.SchoolConfig;
      expect(stale.schema.path("gradesCustomized")).toBeUndefined();

      const SchoolConfig = require("@pravyo/db/models/SchoolConfig").default;
      expect(SchoolConfig).not.toBe(stale);
      expect(SchoolConfig.schema.path("gradesCustomized")).toBeDefined();
      const doc = new SchoolConfig({ school: new mongoose.Types.ObjectId(), grades: ["Nursery"], gradesCustomized: true });
      expect(doc.gradesCustomized).toBe(true);
    });
  });

  it("keeps a cached model that is already up to date", () => {
    jest.isolateModules(() => {
      const mongoose = require("mongoose");
      const SchoolConfig = require("@pravyo/db/models/SchoolConfig").default;
      expect(mongoose.models.SchoolConfig).toBe(SchoolConfig);
      expect(SchoolConfig.schema.path("gradesCustomized")).toBeDefined();
    });
  });
});
