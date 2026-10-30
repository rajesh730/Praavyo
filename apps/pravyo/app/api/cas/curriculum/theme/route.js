import { handler, jsonBody } from '@pravyo/cas/lib/casRoute';
import { createTheme, updateTheme, saveThemeBook, deleteTheme } from '@pravyo/cas/lib/casCurriculumService';

export const dynamic = 'force-dynamic';

export const POST = handler(async ({ actor, request }) =>
  createTheme(actor, await jsonBody(request)),
);

export const PATCH = handler(async ({ actor, request }) =>
  updateTheme(actor, await jsonBody(request)),
);

/** Save the whole theme — name, hours and every row — as edited on screen. */
export const PUT = handler(async ({ actor, request }) =>
  saveThemeBook(actor, await jsonBody(request)),
);

export const DELETE = handler(async ({ actor, request }) =>
  deleteTheme(actor, await jsonBody(request)),
);
