import { api, body } from '../../api/client';
import type { FormConfig, FormStored, Page, Submission } from '../../api/types';

const site = (siteId: string) => ({ params: { path: { site_id: siteId } } });

export const listForms = async (siteId: string): Promise<FormStored[]> =>
  body(await api.GET('/v1/sites/{site_id}/forms', site(siteId)));

export const createForm = async (siteId: string, config: FormConfig): Promise<FormStored> =>
  body(await api.POST('/v1/sites/{site_id}/forms', { ...site(siteId), body: config }));

export const updateForm = async (siteId: string, formId: string, config: FormConfig): Promise<FormStored> =>
  body(
    await api.PUT('/v1/sites/{site_id}/forms/{form_id}', {
      params: { path: { site_id: siteId, form_id: formId } },
      body: config,
    }),
  );

export const deleteForm = async (siteId: string, formId: string): Promise<void> => {
  await api.DELETE('/v1/sites/{site_id}/forms/{form_id}', { params: { path: { site_id: siteId, form_id: formId } } });
};

export const listSubmissions = async (siteId: string, cursor: string | undefined): Promise<Page<Submission>> =>
  body(
    await api.GET('/v1/sites/{site_id}/submissions', {
      params: { path: { site_id: siteId }, query: { limit: 25, cursor } },
    }),
  );

export const setSubmissionStatus = async (
  siteId: string,
  submissionId: string,
  status: Submission['status'],
): Promise<void> => {
  await api.PATCH('/v1/sites/{site_id}/submissions/{submission_id}', {
    params: { path: { site_id: siteId, submission_id: submissionId } },
    body: { status },
  });
};

export const deleteSubmission = async (siteId: string, submissionId: string): Promise<void> => {
  await api.DELETE('/v1/sites/{site_id}/submissions/{submission_id}', {
    params: { path: { site_id: siteId, submission_id: submissionId } },
  });
};
