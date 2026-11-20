'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ClipboardList, ListChecks, RefreshCw, Users, Lock as FaLock, Pen as FaPen, Plus as FaPlus, Send as FaPaperPlane, Trash2 as FaTrash, Unlock as FaUnlock, PenLine, Award } from 'lucide-react';
import { useCas } from './CasLayout.js';
import { useCasMutation } from '../lib/client/useCas.js';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from './ui/Kit.js';
import { EMPTY_EXAM_FORM, InternalExamFields, examBody } from './InternalExamForm.js';
import { InternalExamFilterBar, useInternalExamFilters } from './InternalExamFilters.js';
import InternalAssessmentConfiguration from './InternalAssessmentConfiguration.js';
import InternalGradingScale from './InternalGradingScale.js';
import InternalActivitiesConfiguration from './InternalActivitiesConfiguration.js';
import InternalExamTeachersPanel from './InternalExamTeachersPanel.js';

/**
 * Manage internal exams, in four tabs:
 *   Exams         school-wide exams, created once for every grade; each grade
 *                 enters marks and publishes on its own
 *   Assessment    the school-wide TH / INT structure every exam of every grade uses
 *   Extra Activities the school's own activities, each with full marks
 *   Grading scale the 50-mark scale and the percentage scale (read-only)
 */
export default function InternalExamsPage() {
  const { actor, t } = useCas();
  const filters = useInternalExamFilters({ withSection: false });
  const { academicYear, grade, exams, examsQuery } = filters;
  const { run, pending, error, success, setSuccess } = useCasMutation();
  // null = closed, 'new' = create form, an exam id = editing that exam.
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_EXAM_FORM);
  // The exam whose subject teachers are open, like CAS's teacher access panel.
  const [teachersFor, setTeachersFor] = useState(null);
  const canEdit = actor?.role === 'SCHOOL_ADMIN';
  const [tab, setTab] = useState('exams');
  const tabs = [
    { id: 'exams', icon: CalendarDays, label: t('Exams', 'परीक्षा') },
    ...(canEdit ? [
      { id: 'assessment', icon: ClipboardList, label: t('Assessment', 'मूल्याङ्कन') },
      { id: 'activities', icon: ListChecks, label: t('Extra Activities', 'अतिरिक्त क्रियाकलाप') },
    ] : []),
    { id: 'grading', icon: Award, label: t('Grading scale', 'ग्रेडिङ स्केल') },
  ];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'exams';

  function open(exam) {
    if (!exam) {
      setForm(EMPTY_EXAM_FORM);
      setEditing('new');
      return;
    }
    setForm({
      name: exam.name,
      reportTitle: exam.reportTitle || '',
      issueDate: exam.issueDate,
    });
    setEditing(exam.id);
  }

  async function save(event) {
    event.preventDefault();
    const body = examBody(form);
    const result = editing === 'new'
      ? await run('/api/cas/internal-exams', { method: 'POST', body: { ...body, academicYear: academicYear.id, grade } }, { successMessage: t(`${form.name} created for every grade`, `${form.name} सबै कक्षाका लागि सिर्जना भयो`) })
      : await run('/api/cas/internal-exams', { method: 'PATCH', body: { ...body, id: editing } }, { successMessage: t('Exam saved for every grade', 'परीक्षा सबै कक्षाका लागि सुरक्षित भयो') });
    if (result.ok) {
      setEditing(null);
      examsQuery.reload();
    }
  }

  async function remove(exam) {
    if (!window.confirm(t(`Delete ${exam.name} from every grade? Every mark, attendance and activity entered for it in every grade will be deleted too.`, `${exam.name} सबै कक्षाबाट मेटाउने? सबै कक्षाका यसका अङ्क, हाजिरी र क्रियाकलाप पनि मेटिन्छन्।`))) return;
    const result = await run('/api/cas/internal-exams', { method: 'DELETE', body: { id: exam.id } }, { successMessage: t('Exam deleted', 'परीक्षा मेटियो') });
    if (result.ok) examsQuery.reload();
  }

  // { exam, publish: true | false } while a confirmation is open.
  const [confirming, setConfirming] = useState(null);

  async function changePublishing() {
    const { exam, publish } = confirming;
    setConfirming(null);
    const result = await run('/api/cas/internal-exams/publish', { method: 'POST', body: { exam: exam.id, publish } });
    if (result.ok) {
      setSuccess(publish
        ? t(`${exam.name} published: ${result.data?.published || 0} report cards sent to students and parents. The marks are now locked.`, `${exam.name} प्रकाशित भयो। अङ्क अब लक छन्।`)
        : result.data?.followsCurrentStructure === false
          ? t(`${exam.name} unpublished and fully editable. Some marks do not fit the current assessment structure, so it keeps its published structure until you correct them and choose "Use current structure".`, `${exam.name} अप्रकाशित भयो। केही अङ्क हालको संरचनामा मिल्दैनन्; सच्याएपछि "हालको संरचना प्रयोग" छान्नुहोस्।`)
          : t(`${exam.name} unpublished. Its report cards were removed, and its marks, attendance, activities and structure are editable again.`, `${exam.name} अप्रकाशित भयो। अङ्क, हाजिरी, क्रियाकलाप र संरचना फेरि सम्पादन गर्न मिल्छ।`));
      examsQuery.reload();
    }
  }

  /** An unpublished exam still on its published structure follows the current one again. */
  async function applyCurrentStructure(exam) {
    const result = await run('/api/cas/internal-exams/scheme', { method: 'POST', body: { exam: exam.id } }, {
      successMessage: t(`${exam.name} now uses the current assessment structure.`, `${exam.name} ले अब हालको मूल्याङ्कन संरचना प्रयोग गर्छ।`),
    });
    if (result.ok) examsQuery.reload();
  }

  return (
    <>
      <PageHeader
        eyebrow={t('Internal Exam', 'आन्तरिक परीक्षा')}
        title={t('Manage Exams', 'परीक्षा व्यवस्थापन')}
        description={t(
          'The school’s own written exams, for every grade: the exams, the theory / internal assessment structure, and the grading scale.',
          'विद्यालयका सबै कक्षाका लिखित परीक्षा: परीक्षा, सैद्धान्तिक / आन्तरिक मूल्याङ्कन संरचना र ग्रेडिङ स्केल।',
        )}
      />
      <div className="tabs mb-4" role="tablist" aria-label={t('Manage Exams sections', 'परीक्षा व्यवस्थापन खण्ड')}>
        {tabs.map(({ id, icon: Icon, label }) => (
          <button key={id} type="button" role="tab" className="tab" aria-selected={activeTab === id} onClick={() => setTab(id)}>
            <Icon size={15} aria-hidden /> {label}
          </button>
        ))}
      </div>
      {activeTab === 'exams' && <InternalExamFilterBar filters={filters} t={t} showExam={false} withSection={false} />}
      {confirming && (
        <PublishingDialog
          t={t}
          exam={confirming.exam}
          grade={grade}
          publish={confirming.publish}
          onCancel={() => setConfirming(null)}
          onConfirm={changePublishing}
        />
      )}
      <Alert tone="danger">{error}</Alert>
      <Alert tone="success">{success}</Alert>

      {activeTab === 'assessment' && <InternalAssessmentConfiguration />}
      {activeTab === 'activities' && <InternalActivitiesConfiguration t={t} />}
      {activeTab === 'grading' && <InternalGradingScale t={t} />}

      {activeTab === 'exams' && (
        <Card
          title={grade ? t(`${grade} exams`, `${grade} का परीक्षा`) : t('Exams', 'परीक्षाहरू')}
          description={t(
            'An exam is created once for the whole school and applies to every grade. Each grade enters its marks and publishes its results on its own.',
            'परीक्षा एक पटक सिर्जना गर्दा सबै कक्षामा लागू हुन्छ। हरेक कक्षाले आफ्नै अङ्क प्रविष्टि र नतिजा प्रकाशन गर्छ।',
          )}
          actions={canEdit && grade && editing !== 'new' && <Button onClick={() => open(null)}><FaPlus aria-hidden /> {t('Create exam', 'परीक्षा सिर्जना')}</Button>}
        >
          {editing && (
            <form onSubmit={save} className="mb-4 rounded-card border border-line bg-surface-2 p-3">
              <InternalExamFields form={form} setForm={setForm} academicYear={academicYear} calendar={actor?.calendar} t={t} />
              <p className="mt-2 text-sm text-muted">
                {editing === 'new'
                  ? t('This exam is created for every grade of the school.', 'यो परीक्षा विद्यालयका सबै कक्षाका लागि सिर्जना हुन्छ।')
                  : t('The name, report title and issue date change for every grade.', 'नाम, नतिजा शीर्षक र जारी मिति सबै कक्षामा परिवर्तन हुन्छ।')}
              </p>

              <div className="mt-3 flex gap-2">
                <Button type="submit" disabled={pending}>{pending ? t('Saving…', 'सुरक्षित हुँदैछ…') : t('Save exam', 'परीक्षा सुरक्षित गर्नुहोस्')}</Button>
                <Button variant="secondary" onClick={() => setEditing(null)}>{t('Cancel', 'रद्द')}</Button>
              </div>
            </form>
          )}

          {examsQuery.loading ? <Spinner label={t('Loading exams…', 'परीक्षा लोड हुँदैछ…')} />
            : !exams.length ? (
              <EmptyState
                title={t('No internal exams yet', 'आन्तरिक परीक्षा छैन')}
                description={canEdit ? t('Create the first one, e.g. First Terminal Examination.', 'पहिलो परीक्षा सिर्जना गर्नुहोस्।') : t('Your school has not created one yet.', 'विद्यालयले अझै सिर्जना गरेको छैन।')}
              />
            ) : (
              <ul className="divide-y divide-line">
                {exams.map((exam) => (
                  <li key={exam.id} className="py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{exam.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                        <span>{exam.pinned && !exam.published
                          ? t('Still on the structure it was published with', 'प्रकाशन हुँदाकै संरचनामा')
                          : t('School-wide assessment structure', 'विद्यालय-व्यापी मूल्याङ्कन संरचना')}</span>
                        {exam.published
                          ? <Badge tone="success"><FaLock aria-hidden size={11} className="mr-1 inline" />{t('Published · marks locked', 'प्रकाशित · अङ्क लक')}</Badge>
                          : <Badge>{t('Not published', 'अप्रकाशित')}</Badge>}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href="/school/internal-exam/marks" onClick={() => filters.setExam(exam.id)} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
                        <PenLine size={14} aria-hidden /> {exam.published ? t('View marks', 'अङ्क हेर्नुहोस्') : t('Mark entry', 'अङ्क प्रविष्टि')}
                      </Link>
                      {canEdit && (
                        <Button variant="secondary" className="btn-sm" aria-expanded={teachersFor === exam.id} onClick={() => setTeachersFor(teachersFor === exam.id ? null : exam.id)}>
                          <Users size={14} aria-hidden /> {t('Teachers', 'शिक्षक')}
                        </Button>
                      )}
                      {canEdit && (exam.published ? (
                        <Button variant="secondary" className="btn-sm" disabled={pending} onClick={() => setConfirming({ exam, publish: false })}>
                          <FaUnlock size={14} aria-hidden /> {t('Unpublish', 'अप्रकाशित')}
                        </Button>
                      ) : (
                        <Button className="btn-sm" disabled={pending} onClick={() => setConfirming({ exam, publish: true })}>
                          <FaPaperPlane size={14} aria-hidden /> {t('Publish results', 'नतिजा प्रकाशित')}
                        </Button>
                      ))}
                      {canEdit && !exam.published && (
                        <>
                          {exam.pinned && (
                            <Button variant="secondary" className="btn-sm" disabled={pending} onClick={() => applyCurrentStructure(exam)}>
                              <RefreshCw size={14} aria-hidden /> {t('Use current structure', 'हालको संरचना प्रयोग')}
                            </Button>
                          )}
                          <Button variant="secondary" className="btn-sm" onClick={() => open(exam)}><FaPen size={14} aria-hidden /> {t('Edit', 'सम्पादन')}</Button>
                          <Button variant="danger" className="btn-sm" disabled={pending} onClick={() => remove(exam)}><FaTrash size={14} aria-hidden /> {t('Delete', 'मेटाउनुहोस्')}</Button>
                        </>
                      )}
                    </div>
                  </div>
                  {canEdit && teachersFor === exam.id && <InternalExamTeachersPanel exam={exam} grade={grade} t={t} />}
                  </li>
                ))}
              </ul>
            )}
        </Card>
      )}
    </>
  );
}

/** Publish or unpublish one internal exam, after an explicit tick. */
function PublishingDialog({ t, exam, grade, publish, onCancel, onConfirm }) {
  const [checked, setChecked] = useState(false);
  const points = publish
    ? [
      t('Every student’s report card goes to them and their parents straight away.', 'हरेक विद्यार्थीको नतिजा पत्र तुरुन्तै विद्यार्थी र अभिभावकलाई पठाइन्छ।'),
      t('Every mark must be entered (or the student marked absent) first.', 'पहिले सबै अङ्क प्रविष्ट भएको हुनुपर्छ।'),
      t('The marks, attendance and activities lock. Nobody can change them until you unpublish here.', 'अङ्क, हाजिरी र क्रियाकलाप लक हुन्छन्।'),
    ]
    : [
      t(`The published report cards for ${grade} are removed. Students and parents stop seeing them.`, `${grade} का प्रकाशित नतिजा पत्र हट्छन्।`),
      t('The marks are kept and unlock, so teachers and the school can correct them.', 'अङ्क सुरक्षित रहन्छन् र सच्याउन खुला हुन्छन्।'),
      t('When the corrections are done, publish the exam again here.', 'सच्याएपछि यहीँबाट फेरि प्रकाशित गर्नुहोस्।'),
    ];
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="internal-publishing-title">
      <div className="modal-panel">
        <h2 id="internal-publishing-title" className="text-lg font-semibold text-ink">
          {publish
            ? t(`Publish ${exam.name} for ${grade}?`, `${grade} को ${exam.name} प्रकाशित गर्ने?`)
            : t(`Unpublish ${exam.name} for ${grade}?`, `${grade} को ${exam.name} अप्रकाशित गर्ने?`)}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {points.map((point) => <li key={point}>{point}</li>)}
        </ul>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" className="mt-0.5" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          {publish
            ? t('I have checked these results on the Results screen and they are correct.', 'मैले नतिजा जाँचेँ र सही छन्।')
            : t('I understand students and parents will lose access until it is published again.', 'फेरि प्रकाशित नभएसम्म विद्यार्थी र अभिभावकले हेर्न पाउँदैनन् भन्ने बुझेँ।')}
        </label>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>{t('Cancel', 'रद्द गर्नुहोस्')}</Button>
          <Button variant={publish ? 'primary' : 'danger'} disabled={!checked} onClick={onConfirm}>
            {publish ? <FaPaperPlane aria-hidden /> : <FaUnlock aria-hidden />}
            {publish ? t('Publish results', 'नतिजा प्रकाशित गर्नुहोस्') : t('Unpublish exam', 'परीक्षा अप्रकाशित गर्नुहोस्')}
          </Button>
        </div>
      </div>
    </div>
  );
}
