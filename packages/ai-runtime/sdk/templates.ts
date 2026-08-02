import type { MoniClawClient } from "./client";

/** Phase 8 · Template catalog (declarative worker packages). */

export interface TemplateDto {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  workerType: string;
  icon: string | null;
  version: string;
  publisher: string;
  official: boolean;
  manifest: Record<string, unknown>;
  installs: number;
  createdAt: string;
  updatedAt: string;
  installedAgentIds: string[];
}

export interface TemplateInstallResult {
  agent: { id: string; slug: string; name: string; status: string; templateSlug: string | null };
  template: { slug: string; name: string; version: string };
}

export class TemplatesClient {
  constructor(private readonly client: MoniClawClient) {}

  /** Catalog with workspace-local install state. */
  list() {
    return this.client.request<{ templates: TemplateDto[] }>("GET", "/api/templates");
  }

  /** Install a package — mints a real SHADOW/DRAFT worker in the workspace. */
  install(slug: string) {
    return this.client.request<TemplateInstallResult>("POST", `/api/templates/${slug}/install`);
  }
}
