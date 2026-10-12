import { api, body } from '../../api/client';
import type { SurveyConfig, SurveyResults, SurveyStored } from '../../api/types';

const site = (siteId: string) => ({ params: { path: { site_id: siteId } } });
const one = (siteId: string, surveyId: string) => ({ params: { path: { site_id: siteId, survey_id: surveyId } } });

export const listSurveys = async (siteId: string): Promise<SurveyStored[]> =>
  body(await api.GET('/v1/sites/{site_id}/surveys', site(siteId)));

export const createSurvey = async (siteId: string, config: SurveyConfig): Promise<SurveyStored> =>
  body(await api.POST('/v1/sites/{site_id}/surveys', { ...site(siteId), body: config }));

export const updateSurvey = async (siteId: string, surveyId: string, config: SurveyConfig): Promise<SurveyStored> =>
  body(await api.PUT('/v1/sites/{site_id}/surveys/{survey_id}', { ...one(siteId, surveyId), body: config }));

export const deleteSurvey = async (siteId: string, surveyId: string): Promise<void> => {
  await api.DELETE('/v1/sites/{site_id}/surveys/{survey_id}', one(siteId, surveyId));
};

export const getResults = async (siteId: string, surveyId: string): Promise<SurveyResults> =>
  body(await api.GET('/v1/sites/{site_id}/surveys/{survey_id}/results', one(siteId, surveyId)));
