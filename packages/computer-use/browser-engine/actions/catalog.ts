import { z } from "zod";
import { CueError } from "../../errors";
import type { ActionDefinition } from "./context";
import { goBackAction, goForwardAction, navigateAction, refreshAction } from "./navigation";
import { closeTabAction, openTabAction, switchTabAction } from "./tabs";
import {
  blurAction, clickAction, doubleClickAction, dragAction, dropAction,
  focusAction, hoverAction, rightClickAction,
} from "./mouse";
import { checkboxAction, clearInputAction, radioAction, selectOptionAction, typeAction } from "./input";
import { scrollAction } from "./scroll";
import {
  evaluateDomAction, extractImagesAction, extractLinksAction,
  extractTablesAction, extractTextAction, readAttributesAction,
} from "./dom";
import { printPdfAction, takeScreenshotAction } from "./capture";
import { downloadFileAction, uploadFileAction } from "./files";
import { deleteCookiesAction, readCookiesAction, writeCookiesAction } from "./cookies";
import { executeJavascriptAction } from "./script";
import { waitAction, waitForNavigationAction, waitForSelectorAction } from "./waits";

/**
 * The universal action catalog. Every consumer (planner, REST API, SDK,
 * AI-runtime tools, dashboard) resolves actions through here — one source
 * of truth for ids, schemas, permissions and risk tiers.
 */
export const ACTIONS: readonly ActionDefinition[] = [
  // navigation
  navigateAction, goBackAction, goForwardAction, refreshAction,
  // tabs
  openTabAction, closeTabAction, switchTabAction,
  // mouse
  clickAction, doubleClickAction, rightClickAction, hoverAction, focusAction, blurAction, dragAction, dropAction,
  // input
  typeAction, clearInputAction, selectOptionAction, checkboxAction, radioAction,
  // scroll
  scrollAction,
  // files
  uploadFileAction, downloadFileAction,
  // capture
  takeScreenshotAction, printPdfAction,
  // dom extraction
  extractTextAction, extractLinksAction, extractTablesAction, extractImagesAction, evaluateDomAction, readAttributesAction,
  // script (permission controlled)
  executeJavascriptAction,
  // waits
  waitAction, waitForSelectorAction, waitForNavigationAction,
  // cookies
  readCookiesAction, writeCookiesAction, deleteCookiesAction,
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function actionById(id: string): ActionDefinition {
  const action = BY_ID.get(id);
  if (!action) {
    throw new CueError("validation", `Unknown action "${id}". Known actions: ${ACTIONS.map((a) => a.id).join(", ")}`);
  }
  return action;
}

export function hasAction(id: string): boolean {
  return BY_ID.has(id);
}

export interface ActionMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  permission: string;
  risk: string;
  schema: Record<string, unknown>;
}

/** Public catalog for the API/SDK/dashboard — JSON-schema args included. */
export function catalogMetadata(): ActionMetadata[] {
  return ACTIONS.map((action) => ({
    id: action.id,
    name: action.name,
    description: action.description,
    category: action.category,
    permission: action.permission,
    risk: action.risk,
    schema: z.toJSONSchema(action.schema) as Record<string, unknown>,
  }));
}
